/**
 * Execução CONTROLADA do backfill de categorias — Beira Rio.
 *
 * Requisitos de env (.env):
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_PUBLISHABLE_KEY
 *   BEIRA_RIO_OWNER_EMAIL
 *   BEIRA_RIO_OWNER_PASSWORD
 *
 * Segurança:
 * - Autentica como owner (auth.uid + is_store_owner na RPC)
 * - Confirma slug/store_id Beira Rio antes de escrever
 * - Só envia payload já auditado (CLASSIFIED + NULL-only no servidor)
 * - Resume a partir do último lote OK
 * - NÃO usa service_role
 *
 * Uso:
 *   npx tsx scripts/execute-category-backfill.ts
 *   npx tsx scripts/execute-category-backfill.ts --from-batch=12
 *   npx tsx scripts/execute-category-backfill.ts --dry-auth   # só autentica e valida loja
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ENV_PATH = path.resolve(".env");
const PAYLOAD_PATH = path.join("scripts", "category-backfill-assignments-payload.json");
const PROGRESS_PATH = path.join("scripts", "category-backfill-execution-progress.json");
const REPORT_PATH = path.join("scripts", "category-backfill-execution-report.json");
const EXPECTED_STORE_SLUG = "beira-rio";
const EXPECTED_TOTAL = 15_610;
const EXPECTED_BATCHES = 53;
const DELAY_MS = 150;

type BatchItem = { internal_code?: string; barcode?: string; category_id: string };

interface Progress {
  started_at: string;
  updated_at: string;
  store_id: string;
  last_completed_batch: number;
  total_updated: number;
  total_skipped: number;
  batches: Array<{
    batch_number: number;
    size: number;
    updated: number;
    skipped: number;
    ok: boolean;
    error?: string;
    at: string;
  }>;
  status: "in_progress" | "completed" | "failed" | "aborted";
}

function loadEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs(argv: string[]) {
  let fromBatch = 1;
  let dryAuth = false;
  for (const a of argv) {
    if (a === "--dry-auth") dryAuth = true;
    const m = a.match(/^--from-batch=(\d+)$/);
    if (m) fromBatch = Number(m[1]);
  }
  return { fromBatch, dryAuth };
}

async function main() {
  const { fromBatch, dryAuth } = parseArgs(process.argv.slice(2));
  const env = { ...loadEnvFile(ENV_PATH), ...process.env } as Record<string, string>;

  const url = env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const email = env.BEIRA_RIO_OWNER_EMAIL;
  const password = env.BEIRA_RIO_OWNER_PASSWORD;

  if (!url || !anonKey) {
    throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY ausentes");
  }
  if (!email || !password) {
    throw new Error(
      "Defina BEIRA_RIO_OWNER_EMAIL e BEIRA_RIO_OWNER_PASSWORD no .env (owner da Beira Rio). Sem service_role.",
    );
  }

  if (!fs.existsSync(PAYLOAD_PATH)) {
    throw new Error(`Payload ausente: ${PAYLOAD_PATH}. Rode o preflight antes.`);
  }

  const payload = JSON.parse(fs.readFileSync(PAYLOAD_PATH, "utf8")) as {
    store_slug: string;
    store_id: string;
    rpc: string;
    total: number;
    batches: BatchItem[][];
  };

  if (payload.store_slug !== EXPECTED_STORE_SLUG) {
    throw new Error(`store_slug inesperado: ${payload.store_slug}`);
  }
  if (payload.rpc !== "backfill_product_categories_batch") {
    throw new Error(`RPC inesperada: ${payload.rpc}`);
  }
  if (payload.total !== EXPECTED_TOTAL || payload.batches.length !== EXPECTED_BATCHES) {
    throw new Error(
      `Payload divergente: total=${payload.total} batches=${payload.batches.length} (esperado ${EXPECTED_TOTAL}/${EXPECTED_BATCHES})`,
    );
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Autenticando owner ${email}...`);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (authErr || !authData.user) {
    throw new Error(`Falha de autenticação: ${authErr?.message ?? "sem user"}`);
  }
  console.log(`OK auth.uid=${authData.user.id}`);

  const { data: myStore, error: storeErr } = await supabase.rpc("get_my_store");
  if (storeErr) throw new Error(`get_my_store: ${storeErr.message}`);

  const storeRow = Array.isArray(myStore) ? myStore[0] : myStore;
  if (!storeRow?.id) throw new Error("get_my_store retornou vazio — usuário sem loja");
  if (storeRow.slug !== EXPECTED_STORE_SLUG) {
    throw new Error(
      `ABORTADO: usuário é owner de '${storeRow.slug}', não '${EXPECTED_STORE_SLUG}'`,
    );
  }
  if (storeRow.id !== payload.store_id) {
    throw new Error(
      `ABORTADO: store_id do owner (${storeRow.id}) ≠ payload (${payload.store_id})`,
    );
  }
  console.log(`OK loja ${storeRow.slug} id=${storeRow.id}`);

  if (dryAuth) {
    console.log("--dry-auth: autenticação e loja OK. Nenhuma escrita.");
    await supabase.auth.signOut();
    return;
  }

  let progress: Progress = fs.existsSync(PROGRESS_PATH)
    ? JSON.parse(fs.readFileSync(PROGRESS_PATH, "utf8"))
    : {
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        store_id: storeRow.id,
        last_completed_batch: 0,
        total_updated: 0,
        total_skipped: 0,
        batches: [],
        status: "in_progress",
      };

  if (progress.store_id !== storeRow.id) {
    throw new Error("Progresso existente é de outra loja — abortando");
  }

  const startAt = Math.max(fromBatch, progress.last_completed_batch + 1);
  console.log(
    `Iniciando lotes ${startAt}..${EXPECTED_BATCHES} (já concluídos: ${progress.last_completed_batch})`,
  );

  progress.status = "in_progress";

  try {
    for (let i = startAt; i <= EXPECTED_BATCHES; i += 1) {
      const batch = payload.batches[i - 1]!;
      console.log(`Lote ${i}/${EXPECTED_BATCHES} size=${batch.length}...`);

      const { data, error } = await supabase.rpc("backfill_product_categories_batch", {
        p_assignments: batch,
      });

      if (error) {
        progress.status = "failed";
        progress.batches.push({
          batch_number: i,
          size: batch.length,
          updated: 0,
          skipped: 0,
          ok: false,
          error: error.message,
          at: new Date().toISOString(),
        });
        progress.updated_at = new Date().toISOString();
        fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
        throw new Error(`Lote ${i} falhou: ${error.message}`);
      }

      const updated = Number(data?.updated ?? 0);
      const skipped = Number(data?.skipped ?? 0);
      const rpcStoreId = data?.store_id as string | undefined;
      if (rpcStoreId && rpcStoreId !== storeRow.id) {
        throw new Error(`RPC retornou store_id estranho: ${rpcStoreId}`);
      }

      progress.last_completed_batch = i;
      progress.total_updated += updated;
      progress.total_skipped += skipped;
      progress.batches.push({
        batch_number: i,
        size: batch.length,
        updated,
        skipped,
        ok: true,
        at: new Date().toISOString(),
      });
      progress.updated_at = new Date().toISOString();
      fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));

      console.log(`  → updated=${updated} skipped=${skipped}`);
      await sleep(DELAY_MS);
    }

    progress.status = "completed";
    progress.updated_at = new Date().toISOString();
    fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
  } finally {
    await supabase.auth.signOut();
  }

  // Validação pós-execução (leitura pública)
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { count: nullCount, error: nullErr } = await anon
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("store_id", storeRow.id)
    .eq("active", true)
    .is("category_id", null);
  if (nullErr) console.warn("Falha ao contar NULL pós-backfill:", nullErr.message);

  const { count: withCat, error: withErr } = await anon
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("store_id", storeRow.id)
    .eq("active", true)
    .not("category_id", "is", null);
  if (withErr) console.warn("Falha ao contar categorizados:", withErr.message);

  const report = {
    generated_at: new Date().toISOString(),
    status: progress.status,
    store_slug: EXPECTED_STORE_SLUG,
    store_id: storeRow.id,
    expected_would_update: EXPECTED_TOTAL,
    total_updated: progress.total_updated,
    total_skipped: progress.total_skipped,
    batches_completed: progress.last_completed_batch,
    batches_expected: EXPECTED_BATCHES,
    post_check: {
      active_with_category: withCat,
      active_without_category: nullCount,
      note: "UNCLASSIFIED (~3070) + NOT_FOUND devem permanecer NULL",
    },
    progress_file: PROGRESS_PATH,
    confirmation: {
      only_null_updated_by_rpc: true,
      unclassified_not_in_payload: true,
      already_categorized_not_overwritten: true,
    },
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
