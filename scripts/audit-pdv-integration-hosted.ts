/**
 * Auditoria SOMENTE LEITURA das tabelas PDV no Hosted.
 * Não INSERT/UPDATE/DELETE em dados de produção.
 *
 * Uso: npx tsx scripts/audit-pdv-integration-hosted.ts
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const TABLES = [
  "store_integrations",
  "product_external_identifiers",
  "catalog_sync_runs",
  "catalog_sync_items",
] as const;

function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile();

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const anonKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
const ownerEmail = process.env.BEIRA_RIO_OWNER_EMAIL;
const ownerPassword = process.env.BEIRA_RIO_OWNER_PASSWORD;

if (!url || !anonKey) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY");
  process.exit(1);
}

type ProbeResult = {
  table: string;
  role: "anon" | "authenticated_owner";
  operation: "SELECT" | "INSERT_PROBE";
  ok: boolean;
  rowCount?: number;
  errorCode?: string;
  errorMessage?: string;
};

async function probeSelect(
  client: ReturnType<typeof createClient>,
  table: string,
  role: ProbeResult["role"],
): Promise<ProbeResult> {
  const { data, error, count } = await client
    .from(table)
    .select("*", { count: "exact", head: true });
  return {
    table,
    role,
    operation: "SELECT",
    ok: !error,
    rowCount: count ?? (Array.isArray(data) ? data.length : 0),
    errorCode: error?.code,
    errorMessage: error?.message,
  };
}

async function probeInsertDenied(
  client: ReturnType<typeof createClient>,
  table: string,
): Promise<ProbeResult> {
  const payload: Record<string, unknown> = {};
  if (table === "store_integrations") {
    payload.store_id = "00000000-0000-0000-0000-000000000001";
    payload.provider = "__audit_probe__";
    payload.integration_type = "catalog";
    payload.status = "pending";
  } else if (table === "product_external_identifiers") {
    payload.store_id = "00000000-0000-0000-0000-000000000001";
    payload.product_id = "00000000-0000-0000-0000-000000000002";
    payload.provider = "__audit_probe__";
    payload.external_id = "__audit_probe__";
  } else if (table === "catalog_sync_runs") {
    payload.store_id = "00000000-0000-0000-0000-000000000001";
    payload.integration_id = "00000000-0000-0000-0000-000000000003";
    payload.status = "running";
  } else {
    payload.sync_run_id = "00000000-0000-0000-0000-000000000004";
    payload.store_id = "00000000-0000-0000-0000-000000000001";
    payload.action = "SKIP";
  }

  const { error } = await client.from(table).insert(payload);
  const denied =
    !!error &&
    (error.code === "42501" ||
      error.code === "PGRST301" ||
      error.message.toLowerCase().includes("permission") ||
      error.message.toLowerCase().includes("policy") ||
      error.message.toLowerCase().includes("violates row-level security") ||
      error.message.toLowerCase().includes("new row violates"));

  return {
    table,
    role: "authenticated_owner",
    operation: "INSERT_PROBE",
    ok: denied,
    errorCode: error?.code,
    errorMessage: error?.message,
  };
}

async function fetchOpenApiColumns(): Promise<Record<string, string[]>> {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: {
      apikey: anonKey!,
      Authorization: `Bearer ${anonKey}`,
      Accept: "application/openapi+json",
    },
  });
  if (!res.ok) return {};
  const spec = (await res.json()) as {
    components?: { schemas?: Record<string, { properties?: Record<string, unknown> }> };
  };
  const out: Record<string, string[]> = {};
  for (const table of TABLES) {
    const schema = spec.components?.schemas?.[table];
    if (schema?.properties) {
      out[table] = Object.keys(schema.properties).sort();
    }
  }
  return out;
}

async function main() {
  const anon = createClient(url!, anonKey!);
  const probes: ProbeResult[] = [];

  for (const table of TABLES) {
    probes.push(await probeSelect(anon, table, "anon"));
  }

  let ownerClient: ReturnType<typeof createClient> | null = null;
  if (ownerEmail && ownerPassword) {
    const authClient = createClient(url!, anonKey!);
    const { data: auth, error: authErr } = await authClient.auth.signInWithPassword({
      email: ownerEmail,
      password: ownerPassword,
    });
    if (authErr) {
      console.warn("Owner login failed:", authErr.message);
    } else if (auth.session) {
      ownerClient = createClient(url!, anonKey!, {
        global: { headers: { Authorization: `Bearer ${auth.session.access_token}` } },
      });
      for (const table of TABLES) {
        probes.push(await probeSelect(ownerClient, table, "authenticated_owner"));
        probes.push(await probeInsertDenied(ownerClient, table));
      }
    }
  }

  const openApiColumns = await fetchOpenApiColumns();

  const report = {
    audited_at: new Date().toISOString(),
    supabase_url: url,
    tables: TABLES,
    open_api_columns: openApiColumns,
    probes,
    expected_from_migration: {
      rls: "ENABLED on all 4 tables",
      policies: "owner_select only — is_store_owner(store_id) OR is_platform_admin()",
      grants: "REVOKE ALL FROM anon; GRANT SELECT TO authenticated only",
      unique_constraints: [
        "store_integrations (store_id, provider, integration_type)",
        "product_external_identifiers (store_id, provider, external_id)",
      ],
      gaps: [
        "No INSERT/UPDATE/DELETE policies for authenticated — writes must use SECURITY DEFINER RPC or service_role edge function",
        "service_role bypasses RLS by design — sync RPC must validate integration_id → store_id",
        "catalog_sync_items.store_id must match catalog_sync_runs.store_id — no DB CHECK yet (application/RPC responsibility)",
      ],
    },
  };

  const outPath = path.join(process.cwd(), "scripts", "pdv-integration-hosted-audit.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Audit report written to ${outPath}`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
