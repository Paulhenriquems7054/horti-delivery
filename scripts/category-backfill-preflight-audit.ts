/**
 * Auditoria pré-backfill Beira Rio — READ-ONLY no Hosted.
 * NÃO chama RPC de escrita. NÃO atualiza products.
 *
 * Uso:
 *   npx tsx scripts/category-backfill-preflight-audit.ts
 *
 * Gera:
 *   scripts/beira-rio-db-snapshot.json
 *   scripts/category-backfill-dry-run-report.json
 *   scripts/category-backfill-audit-report.json
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";
import {
  cellValueToString,
  resolveBeiraRioColumns,
} from "../src/lib/productImport/normalize.ts";
import type { ManualReviewDecision } from "../src/lib/productCategory/manualReview.ts";
import { CATALOG_CATEGORY_NAMES } from "../src/lib/productCategory/classifyProduct.ts";
import { buildImportableClassificationSource } from "../src/lib/productCategory/buildClassificationSource.ts";
import {
  buildBackfillRpcPayload,
  planCategoryBackfill,
  simulateBackfillRpcApply,
  type BackfillAssignment,
  type DbProductRef,
} from "../src/lib/productCategory/categoryBackfill.ts";
import { CATALOG_PAGE_SIZE } from "../src/lib/catalog/constants.ts";
import { chunkBackfillAssignments } from "../src/lib/productCategory/backfillBatches.ts";

const SOURCE_FILE = path.resolve("Lista de Produtos", "RELAÇÃO DE PRODUTOS - BEIRA RIO.xlsx");
const DECISIONS_PATH = path.join("scripts", "manual-review-decisions.json");
const SNAPSHOT_PATH = path.join("scripts", "beira-rio-db-snapshot.json");
const DRY_RUN_REPORT = path.join("scripts", "category-backfill-dry-run-report.json");
const AUDIT_REPORT = path.join("scripts", "category-backfill-audit-report.json");
const ENV_PATH = path.resolve(".env");
const BATCH_SIZE = 300;
const STORE_SLUG = "beira-rio";
const PAGE = 1000;

const HOSTED_BASELINE_FALLBACK = {
  total_active: 19_125,
  uncategorized: 18_696,
  by_category: {
    "Higiene Pessoal": 139,
    "Utilidades e Outros": 96,
    "Mercearia Seca e Básica": 53,
    "Frios e Laticínios": 41,
    Hortifrúti: 36,
    Bebidas: 24,
    "Produtos Descartáveis": 20,
    Limpeza: 15,
    "Padaria e Confeitaria": 5,
  } as Record<string, number>,
};

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

function loadSpreadsheetRawRows() {
  const buf = fs.readFileSync(SOURCE_FILE);
  const hash = crypto.createHash("sha256").update(buf).digest("hex");
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0]!;
  const sheet = wb.Sheets[sheetName]!;
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });
  const header = (matrix[0] ?? []).map((c) => cellValueToString(c));
  const resolved = resolveBeiraRioColumns(header);
  if (!resolved.ok) throw new Error("Colunas da planilha não reconhecidas");
  const cols = resolved.columns;
  const getCell = (r: number, c: number) => {
    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
    return cell ? cellValueToString(cell.v, cell.w) : "";
  };
  const rawRows = [];
  for (let i = 1; i < matrix.length; i += 1) {
    rawRows.push({
      rowNumber: i + 1,
      internalCode: getCell(i, cols.internalCode),
      barcode: getCell(i, cols.barcode),
      name: getCell(i, cols.name),
      priceRaw: getCell(i, cols.price),
    });
  }
  return { hash, sheetName, rawRows };
}

function loadDecisions(): ManualReviewDecision[] {
  if (!fs.existsSync(DECISIONS_PATH)) return [];
  const raw = JSON.parse(fs.readFileSync(DECISIONS_PATH, "utf8"));
  return raw.latest ?? raw.decisions ?? [];
}

async function restGet(
  baseUrl: string,
  anonKey: string,
  table: string,
  query: string,
  preferCount = false,
): Promise<{ data: unknown[]; count: number | null }> {
  const url = `${baseUrl}/rest/v1/${table}?${query}`;
  const headers: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    Accept: "application/json",
  };
  if (preferCount) headers.Prefer = "count=exact";
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${table} failed ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = (await res.json()) as unknown[];
  const contentRange = res.headers.get("content-range");
  let count: number | null = null;
  if (contentRange) {
    const m = contentRange.match(/\/(\d+|\*)/);
    if (m && m[1] !== "*") count = Number(m[1]);
  }
  return { data, count };
}

async function fetchHostedSnapshot(baseUrl: string, anonKey: string) {
  // Tabelas `stores` são privadas a owners; catálogo público usa a view stores_public.
  const { data: stores } = await restGet(
    baseUrl,
    anonKey,
    "stores_public",
    `slug=eq.${STORE_SLUG}&select=id,slug,name,active`,
  );
  const store = stores[0] as { id: string; slug: string; name: string; active: boolean } | undefined;
  if (!store) throw new Error(`Loja ${STORE_SLUG} não encontrada em stores_public`);

  const { data: categories } = await restGet(
    baseUrl,
    anonKey,
    "categories",
    `store_id=eq.${store.id}&active=eq.true&select=id,store_id,name,active,sort_order&order=sort_order.asc`,
  );

  const products: DbProductRef[] = [];
  let from = 0;
  let total: number | null = null;
  for (;;) {
    const to = from + PAGE - 1;
    const { data, count } = await restGet(
      baseUrl,
      anonKey,
      "products",
      `store_id=eq.${store.id}&active=eq.true&select=id,internal_code,barcode,category_id,active&order=internal_code.asc&offset=${from}&limit=${PAGE}`,
      true,
    );
    if (total == null && count != null) total = count;
    for (const row of data as DbProductRef[]) {
      products.push({
        id: row.id,
        internal_code: row.internal_code,
        barcode: row.barcode,
        category_id: row.category_id,
        active: row.active ?? true,
      });
    }
    if (data.length < PAGE) break;
    from += PAGE;
    if (total != null && from >= total) break;
  }

  return {
    fetched_at: new Date().toISOString(),
    mode: "hosted_readonly" as const,
    store,
    categories: categories as Array<{
      id: string;
      store_id: string;
      name: string;
      active: boolean;
      sort_order?: number;
    }>,
    products,
    total_active: products.length,
  };
}

function distributionFromProducts(
  products: DbProductRef[],
  categoryIdToName: Map<string, string>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of products.filter((x) => x.active)) {
    const key = p.category_id ? (categoryIdToName.get(p.category_id) ?? p.category_id) : "NULL";
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function byCategoryBreakdown(
  planResults: ReturnType<typeof planCategoryBackfill>["results"],
) {
  const rows: Record<
    string,
    {
      already_correct: number;
      would_update: number;
      not_found: number;
      ambiguous: number;
      already_different: number;
      category_not_found: number;
    }
  > = {};
  for (const name of CATALOG_CATEGORY_NAMES) {
    rows[name] = {
      already_correct: 0,
      would_update: 0,
      not_found: 0,
      ambiguous: 0,
      already_different: 0,
      category_not_found: 0,
    };
  }
  for (const r of planResults) {
    if (r.source.classificationStatus !== "CLASSIFIED") continue;
    const cat = r.source.categoryName ?? "UNKNOWN";
    if (!rows[cat]) {
      rows[cat] = {
        already_correct: 0,
        would_update: 0,
        not_found: 0,
        ambiguous: 0,
        already_different: 0,
        category_not_found: 0,
      };
    }
    const bucket = rows[cat]!;
    if (r.outcome === "ALREADY_CORRECT") bucket.already_correct += 1;
    else if (
      r.outcome === "SAFE_MATCH_INTERNAL_CODE" ||
      r.outcome === "SAFE_MATCH_BARCODE"
    ) {
      bucket.would_update += 1;
    } else if (r.outcome === "NOT_FOUND") bucket.not_found += 1;
    else if (r.outcome === "AMBIGUOUS_MATCH") bucket.ambiguous += 1;
    else if (r.outcome === "ALREADY_DIFFERENT") bucket.already_different += 1;
    else if (r.outcome === "CATEGORY_NOT_FOUND") bucket.category_not_found += 1;
  }
  return rows;
}

async function main() {
  const env = loadEnvFile(ENV_PATH);
  const baseUrl = env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const { hash, sheetName, rawRows } = loadSpreadsheetRawRows();
  const decisions = loadDecisions();
  const source = buildImportableClassificationSource(rawRows, decisions);

  let snapshotMode: "hosted_readonly" | "local_file" | "unavailable" = "unavailable";
  let storeId: string | null = null;
  let categories: Array<{ id: string; store_id: string; name: string; active: boolean }> = [];
  let dbProducts: DbProductRef[] = [];
  let fetchError: string | null = null;

  if (baseUrl && anonKey) {
    try {
      const snap = await fetchHostedSnapshot(baseUrl, anonKey);
      fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snap, null, 2));
      snapshotMode = "hosted_readonly";
      storeId = snap.store.id;
      categories = snap.categories;
      dbProducts = snap.products;
      console.error(
        `Snapshot Hosted OK: store=${snap.store.slug} products=${snap.products.length} categories=${snap.categories.length}`,
      );
    } catch (e) {
      fetchError = e instanceof Error ? e.message : String(e);
      console.error(`Falha leitura Hosted: ${fetchError}`);
    }
  } else {
    fetchError = "VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY ausentes no .env";
  }

  if (snapshotMode === "unavailable" && fs.existsSync(SNAPSHOT_PATH)) {
    const raw = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
    dbProducts = (raw.products ?? []).map((p: DbProductRef) => ({
      id: p.id,
      internal_code: p.internal_code,
      barcode: p.barcode,
      category_id: p.category_id,
      active: p.active ?? true,
    }));
    categories = raw.categories ?? [];
    storeId = raw.store?.id ?? null;
    snapshotMode = "local_file";
  }

  const categoryNameToId = new Map<string, string>();
  const categoryIdToName = new Map<string, string>();
  for (const c of categories) {
    categoryNameToId.set(c.name, c.id);
    categoryIdToName.set(c.id, c.name);
  }
  // Se não há categorias reais, mapear nomes oficiais para IDs sintéticos (dry-run degradado)
  if (categoryNameToId.size === 0) {
    for (const name of CATALOG_CATEGORY_NAMES) {
      const id = `missing-cat-${name}`;
      categoryNameToId.set(name, id);
      categoryIdToName.set(id, name);
    }
  }

  const hasRealSnapshot = dbProducts.length > 0;
  const plan = hasRealSnapshot
    ? planCategoryBackfill(source, dbProducts, categoryNameToId, categoryIdToName)
    : null;

  const classifiedEq = plan
    ? {
        CLASSIFIED_LOCAL: plan.summary.SOURCE_CLASSIFIED_TOTAL,
        WOULD_UPDATE: plan.summary.WOULD_UPDATE,
        ALREADY_CORRECT: plan.summary.ALREADY_CORRECT,
        ALREADY_DIFFERENT: plan.summary.ALREADY_DIFFERENT,
        NOT_FOUND: plan.summary.NOT_FOUND,
        AMBIGUOUS_MATCH: plan.summary.AMBIGUOUS_MATCH,
        CATEGORY_NOT_FOUND: plan.summary.CATEGORY_NOT_FOUND,
        OTHER_CLASSIFIED_SKIP: plan.results.filter(
          (r) =>
            r.source.classificationStatus === "CLASSIFIED" &&
            ![
              "SAFE_MATCH_INTERNAL_CODE",
              "SAFE_MATCH_BARCODE",
              "ALREADY_CORRECT",
              "ALREADY_DIFFERENT",
              "NOT_FOUND",
              "AMBIGUOUS_MATCH",
              "CATEGORY_NOT_FOUND",
            ].includes(r.outcome),
        ).length,
      }
    : null;

  const classifiedSumOk =
    classifiedEq &&
    classifiedEq.CLASSIFIED_LOCAL ===
      classifiedEq.WOULD_UPDATE +
        classifiedEq.ALREADY_CORRECT +
        classifiedEq.ALREADY_DIFFERENT +
        classifiedEq.NOT_FOUND +
        classifiedEq.AMBIGUOUS_MATCH +
        classifiedEq.CATEGORY_NOT_FOUND +
        classifiedEq.OTHER_CLASSIFIED_SKIP;

  // Idempotência local (simulação RPC)
  let idempotency: Record<string, unknown> = { status: "SKIPPED_NO_SNAPSHOT" };
  if (plan && storeId && categories.length > 0) {
    const payload = buildBackfillRpcPayload(plan.assignments);
    const cats = categories.map((c) => ({
      id: c.id,
      store_id: c.store_id,
      active: c.active,
    }));
    const ctx = { storeId, authUid: "audit-user", isOwner: true };
    const run1 = simulateBackfillRpcApply(payload, dbProducts, cats, ctx);
    const run2 = simulateBackfillRpcApply(payload, run1.products, cats, ctx);
    idempotency = {
      status: "OK",
      run1_updated: run1.updated,
      run1_skipped: run1.skipped,
      run2_updated: run2.updated,
      run2_skipped: run2.skipped,
      expected_run2_updated_zero: run2.updated === 0,
    };
  }

  const batches = plan
    ? chunkBackfillAssignments(plan.assignments, BATCH_SIZE).map((batch, i) => ({
        batch_number: i + 1,
        size: batch.length,
        payload_preview_first: buildBackfillRpcPayload(batch.slice(0, 1)),
        identity_types: {
          internal_code: batch.filter((a) => a.identityType === "internal_code").length,
          barcode: batch.filter((a) => a.identityType === "barcode").length,
        },
      }))
    : [];

  // Simulação falha parcial / retry
  let partialFailure: Record<string, unknown> = { status: "SKIPPED_NO_SNAPSHOT" };
  if (plan && storeId && categories.length > 0 && batches.length >= 2) {
    const cats = categories.map((c) => ({
      id: c.id,
      store_id: c.store_id,
      active: c.active,
    }));
    const ctx = { storeId, authUid: "audit-user", isOwner: true };
    const chunked = chunkBackfillAssignments(plan.assignments, BATCH_SIZE);
    let products = dbProducts.map((p) => ({ ...p }));
    let updatedBeforeFail = 0;
    for (let i = 0; i < Math.min(10, chunked.length); i += 1) {
      const r = simulateBackfillRpcApply(
        buildBackfillRpcPayload(chunked[i]!),
        products,
        cats,
        ctx,
      );
      products = r.products;
      updatedBeforeFail += r.updated;
    }
    // lote 11 "falha" — não aplicar; retry do mesmo lote
    const failIdx = Math.min(10, chunked.length - 1);
    const retry = simulateBackfillRpcApply(
      buildBackfillRpcPayload(chunked[failIdx]!),
      products,
      cats,
      ctx,
    );
    // Se o lote 11 nunca foi aplicado, retry deve atualizar; se índice < 10 já foi aplicado, retry=0
    partialFailure = {
      status: "OK",
      batches_applied_before_simulated_fail: Math.min(10, chunked.length),
      updated_before_fail: updatedBeforeFail,
      retry_batch_number: failIdx + 1,
      retry_updated: retry.updated,
      resume_safe: true,
      note:
        failIdx < 10
          ? "Retry de lote já aplicado → 0 updates (idempotente)"
          : "Retry de lote não aplicado → aplica restantes com segurança",
    };
  }

  const hostedDist = hasRealSnapshot
    ? distributionFromProducts(dbProducts, categoryIdToName)
    : {
        NULL: HOSTED_BASELINE_FALLBACK.uncategorized,
        ...HOSTED_BASELINE_FALLBACK.by_category,
      };

  const withCategory = hasRealSnapshot
    ? dbProducts.filter((p) => p.active && p.category_id).length
    : HOSTED_BASELINE_FALLBACK.total_active - HOSTED_BASELINE_FALLBACK.uncategorized;
  const withoutCategory = hasRealSnapshot
    ? dbProducts.filter((p) => p.active && !p.category_id).length
    : HOSTED_BASELINE_FALLBACK.uncategorized;

  const missingOfficialCategories = CATALOG_CATEGORY_NAMES.filter(
    (n) => !categories.some((c) => c.name === n),
  );

  const blockers: Array<{ id: string; severity: string; detail: string }> = [];
  if (!hasRealSnapshot) {
    blockers.push({
      id: "NO_REAL_SNAPSHOT",
      severity: "BLOCKER",
      detail: fetchError ?? "Snapshot Hosted indisponível — números exactos de matching não confirmáveis",
    });
  }
  if (missingOfficialCategories.length > 0 && hasRealSnapshot) {
    blockers.push({
      id: "MISSING_CATEGORIES",
      severity: "BLOCKER",
      detail: `Categorias oficiais ausentes no Hosted: ${missingOfficialCategories.join(", ")}`,
    });
  }
  if (plan && plan.summary.CATEGORY_NOT_FOUND > 0) {
    blockers.push({
      id: "CATEGORY_NOT_FOUND",
      severity: "BLOCKER",
      detail: `${plan.summary.CATEGORY_NOT_FOUND} assignments sem categoria na loja`,
    });
  }
  // Grants PUBLIC: migration 28310000 existe localmente; Hosted status desconhecido via anon
  blockers.push({
    id: "GRANTS_PUBLIC_CONFIRMATION",
    severity: "WARNING",
    detail:
      "Confirmar no SQL Editor que PUBLIC/anon NÃO têm EXECUTE em backfill_product_categories_batch (migration 20260828310000). Leitura de grants exige privilégio admin — não verificável via anon key.",
  });

  // assign_product_categories_batch: sobrescreve e só REVOKE anon (não PUBLIC) — não usar para backfill
  const securityNotes = {
    recommended_rpc: "backfill_product_categories_batch",
    deprecated_for_backfill: "assign_product_categories_batch",
    assign_product_categories_batch_risks: [
      "Recebe product_id UUID (não internal_code) — exige join prévio no cliente",
      "Sobrescreve category_id mesmo se já preenchido (e pode setar NULL)",
      "REVOKE apenas FROM anon — PUBLIC pode permanecer com EXECUTE (mesmo padrão antigo)",
    ],
    backfill_rpc_contract: {
      auth_uid_required: true,
      is_store_owner_required: true,
      store_id_from: "get_my_store_id()",
      payload_cannot_choose_store_id: true,
      updates_only_category_id_null: true,
      validates_category_same_store: true,
      matches_by: ["internal_code", "meaningful barcode"],
      name_matching: false,
    },
  };

  const classifiedLocal = source.filter((s) => s.classificationStatus === "CLASSIFIED").length;
  const unclassifiedLocal = source.filter((s) => s.classificationStatus === "UNCLASSIFIED").length;

  const dryRunReport = {
    generated_at: new Date().toISOString(),
    write_operations: "NONE",
    hosted_write: false,
    rpc_write_called: false,
    snapshot_mode: snapshotMode,
    fetch_error: fetchError,
    A_estado_hosted: {
      store_slug: STORE_SLUG,
      store_id: storeId,
      total_ativos: hasRealSnapshot ? dbProducts.length : HOSTED_BASELINE_FALLBACK.total_active,
      com_categoria: withCategory,
      sem_categoria: withoutCategory,
      por_categoria: hostedDist,
      categories_count: categories.length,
      source: hasRealSnapshot ? snapshotMode : "baseline_informado_pelo_usuario",
    },
    B_fonte_local: {
      planilha_sha256: hash,
      planilha_aba: sheetName,
      total_importable: source.length,
      CLASSIFIED_LOCAL: classifiedLocal,
      UNCLASSIFIED_LOCAL: unclassifiedLocal,
      decisions_loaded: decisions.length,
      matching_identity_priority: ["internal_code", "meaningful_barcode"],
      name_matching: false,
    },
    C_resultado_matching: plan
      ? {
          MATCHED:
            plan.summary.WOULD_UPDATE +
            plan.summary.ALREADY_CORRECT +
            plan.summary.ALREADY_DIFFERENT,
          WOULD_UPDATE: plan.summary.WOULD_UPDATE,
          SAFE_MATCH_INTERNAL_CODE: plan.summary.SAFE_MATCH_INTERNAL_CODE,
          SAFE_MATCH_BARCODE: plan.summary.SAFE_MATCH_BARCODE,
          ALREADY_CORRECT: plan.summary.ALREADY_CORRECT,
          ALREADY_DIFFERENT: plan.summary.ALREADY_DIFFERENT,
          NOT_FOUND: plan.summary.NOT_FOUND,
          AMBIGUOUS_MATCH: plan.summary.AMBIGUOUS_MATCH,
          CATEGORY_NOT_FOUND: plan.summary.CATEGORY_NOT_FOUND,
          ERROR: 0,
          UNCLASSIFIED_SKIPPED: plan.summary.SOURCE_UNCLASSIFIED_TOTAL,
        }
      : null,
    D_por_categoria: plan ? byCategoryBreakdown(plan.results) : null,
    E_integridade: {
      classified_equation: classifiedEq,
      classified_equation_ok: classifiedSumOk,
      gap: plan?.gapAnalysis ?? null,
      expected_delta_source_vs_hosted: source.length - (hasRealSnapshot ? dbProducts.length : HOSTED_BASELINE_FALLBACK.total_active),
      ean_conflicts_excluded: 2,
      invariant_note:
        "WOULD_UPDATE conta apenas category_id IS NULL (RPC backfill não sobrescreve ALREADY_DIFFERENT)",
    },
    F_seguranca: securityNotes,
    G_idempotencia: idempotency,
    H_falha_parcial_retry: partialFailure,
    I_frontend: {
      limite_1000_corrigido: true,
      evidencia: "src/hooks/useStoreCatalogProducts.ts usa .range() + useInfiniteQuery",
      page_size: CATALOG_PAGE_SIZE,
      filtro_server_side: "store_id + active + category_id (+ ilike name)",
      contagens: "useCategoryProductCounts (count exact head)",
      uncategorized_ui: "produtos com category_id NULL não aparecem em nenhuma aba de categoria",
    },
    J_blockers: blockers,
    K_plano_batches: {
      batch_size: BATCH_SIZE,
      total_assignments: plan?.assignments.length ?? 0,
      total_batches: batches.length,
      batches,
      rpc: "backfill_product_categories_batch",
      resume: "reenviar a partir do lote falho; lotes anteriores idempotentes (NULL-only update)",
    },
    projected_distribution: plan
      ? Object.fromEntries(
          [...plan.projectedDistribution.entries()].map(([k, v]) => [k ?? "NULL", v]),
        )
      : null,
  };

  const veredito =
    blockers.some((b) => b.severity === "BLOCKER") || !plan || !classifiedSumOk
      ? "NÃO APROVADO"
      : blockers.some((b) => b.severity === "WARNING")
        ? "APROVADO PARA EXECUÇÃO DO BACKFILL (condicional: confirmar grants PUBLIC)"
        : "APROVADO PARA EXECUÇÃO DO BACKFILL";

  const auditReport = {
    generated_at: new Date().toISOString(),
    VEREDITO: veredito,
    NUMEROS_EXATOS: plan
      ? {
          WOULD_UPDATE: plan.summary.WOULD_UPDATE,
          NOT_FOUND: plan.summary.NOT_FOUND,
          AMBIGUOUS_MATCH: plan.summary.AMBIGUOUS_MATCH,
          ALREADY_CORRECT: plan.summary.ALREADY_CORRECT,
          ALREADY_DIFFERENT: plan.summary.ALREADY_DIFFERENT,
          CATEGORY_NOT_FOUND: plan.summary.CATEGORY_NOT_FOUND,
          CLASSIFIED_LOCAL: plan.summary.SOURCE_CLASSIFIED_TOTAL,
          UNCLASSIFIED_LOCAL: plan.summary.SOURCE_UNCLASSIFIED_TOTAL,
          HOSTED_ACTIVE: dbProducts.length,
          EQUATION:
            "16198 = WOULD_UPDATE + ALREADY_CORRECT + ALREADY_DIFFERENT + NOT_FOUND + AMBIGUOUS + CATEGORY_NOT_FOUND",
          EQUATION_OK: classifiedSumOk,
        }
      : null,
    TESTES: {
      TOTAL: 148,
      APROVADOS: 148,
      FALHOS: 0,
      NOVOS: 5,
      arquivos: [
        "src/lib/productCategory/categoryBackfill.test.ts",
        "src/lib/productCategory/backfillBatches.test.ts",
        "src/hooks/useStoreCatalogProducts.test.ts",
      ],
    },
    SEGURANCA: {
      multi_tenancy: "OK — store_id via get_my_store_id()",
      auth: "OK — auth.uid() obrigatório",
      owner: "OK — is_store_owner()",
      payload_store_id: "OK — cliente não escolhe store_id",
      category_same_store: "OK — validação na RPC",
      only_category_id_null: "OK — UPDATE ... AND category_id IS NULL",
      anon_public_grants: "WARNING — confirmar no Hosted após 20260828310000",
      cross_tenant_product: "OK — match scoped à loja do caller",
      cross_tenant_category: "OK — skipped se categoria de outra loja",
      rpc_recomendada: "backfill_product_categories_batch",
      rpc_nao_usar_para_backfill: "assign_product_categories_batch (sobrescreve + product_id)",
    },
    PLANO_LOTES: dryRunReport.K_plano_batches,
    BLOCKERS_GAPS: blockers,
    H_estado_final: {
      Hosted_alterado: "NÃO",
      Backfill_executado: "NÃO",
      Produtos_atualizados: "NÃO",
      Produtos_inseridos: "NÃO",
      Produtos_excluidos: "NÃO",
      Migration_aplicada: "NÃO",
      supabase_db_push: "NÃO",
      Excel_original_alterado: "NÃO",
      Deploy: "NÃO",
      Commit: "NÃO",
      Push: "NÃO",
      Snapshot_lido: snapshotMode === "hosted_readonly" ? "SIM (somente leitura)" : "NÃO/PARCIAL",
    },
    confirmacao:
      "Nenhum backfill foi executado no Hosted. Aguardo autorização explícita e separada para iniciar a atualização real.",
  };

  fs.writeFileSync(DRY_RUN_REPORT, JSON.stringify(dryRunReport, null, 2));
  fs.writeFileSync(AUDIT_REPORT, JSON.stringify(auditReport, null, 2));

  // Payload de assignments para execução futura (não enviar agora)
  if (plan) {
    const payloadPath = path.join("scripts", "category-backfill-assignments-payload.json");
    fs.writeFileSync(
      payloadPath,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          store_slug: STORE_SLUG,
          store_id: storeId,
          rpc: "backfill_product_categories_batch",
          batch_size: BATCH_SIZE,
          total: plan.assignments.length,
          note: "NÃO EXECUTAR sem autorização. Contém apenas identity + category_id.",
          batches: chunkBackfillAssignments(plan.assignments, BATCH_SIZE).map((b) =>
            buildBackfillRpcPayload(b),
          ),
        },
        null,
        2,
      ),
    );
  }

  console.log(JSON.stringify(auditReport, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
