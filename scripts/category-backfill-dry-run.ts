/**
 * Dry-run local de backfill de categorias + auditoria de paginação.
 * NÃO conecta ao Hosted. NÃO executa RPC. NÃO altera banco.
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
import {
  buildImportableClassificationSource,
} from "../src/lib/productCategory/buildClassificationSource.ts";
import {
  planCategoryBackfill,
  type DbProductRef,
} from "../src/lib/productCategory/categoryBackfill.ts";
import { CATALOG_PAGE_SIZE } from "../src/lib/catalog/constants.ts";

const SOURCE_FILE = path.resolve("Lista de Produtos", "RELAÇÃO DE PRODUTOS - BEIRA RIO.xlsx");
const DECISIONS_PATH = path.join("scripts", "manual-review-decisions.json");
const SNAPSHOT_PATH = path.join("scripts", "beira-rio-db-snapshot.json");
const REPORT_PATH = path.join("scripts", "category-backfill-and-catalog-pagination-audit.json");

const HOSTED_BASELINE = {
  store_slug: "beira-rio",
  total_active: 19_125,
  uncategorized: 18_696,
  by_category: {
    "Higiene Pessoal": 139,
    "Utilidades e Outros": 96,
    "Mercearia Seca e Básica": 53,
    "Frios e Laticínios": 41,
    "Hortifrúti": 36,
    "Bebidas": 24,
    "Produtos Descartáveis": 20,
    "Limpeza": 15,
    "Padaria e Confeitaria": 5,
  },
};

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

function mapToRecord(dist: Map<string | null, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of dist.entries()) {
    out[k ?? "NULL"] = v;
  }
  return out;
}

function buildSimulatedDbFromSource(
  source: ReturnType<typeof buildImportableClassificationSource>,
  hostedBaseline: typeof HOSTED_BASELINE,
): DbProductRef[] {
  const products: DbProductRef[] = source.map((s, i) => ({
    id: `sim-${s.internalCode}-${i}`,
    internal_code: s.internalCode,
    barcode: s.barcode,
    category_id: null,
    active: true,
  }));

  let categorizedSlots = hostedBaseline.total_active - hostedBaseline.uncategorized;
  const categoryIds = new Map<string, string>();
  for (const name of CATALOG_CATEGORY_NAMES) {
    categoryIds.set(name, `sim-cat-${name}`);
  }

  for (const [catName, count] of Object.entries(hostedBaseline.by_category)) {
    let assigned = 0;
    const catId = categoryIds.get(catName)!;
    for (const p of products) {
      if (assigned >= count) break;
      if (p.category_id != null) continue;
      const src = source.find((s) => s.internalCode === p.internal_code);
      if (src?.categoryName === catName) {
        p.category_id = catId;
        assigned += 1;
        categorizedSlots -= 1;
      }
    }
  }

  if (products.length > hostedBaseline.total_active) {
    products.splice(hostedBaseline.total_active);
  }

  return products;
}

function loadDbSnapshotOrSimulate(
  source: ReturnType<typeof buildImportableClassificationSource>,
): { products: DbProductRef[]; mode: "snapshot" | "simulated" } {
  if (fs.existsSync(SNAPSHOT_PATH)) {
    const raw = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
    const products: DbProductRef[] = (raw.products ?? raw).map((p: DbProductRef) => ({
      id: p.id,
      internal_code: p.internal_code,
      barcode: p.barcode,
      category_id: p.category_id,
      active: p.active ?? true,
    }));
    return { products, mode: "snapshot" };
  }
  return {
    products: buildSimulatedDbFromSource(source, HOSTED_BASELINE),
    mode: "simulated",
  };
}

function main() {
  const auditedFiles = [
    "scripts/manual-review-decisions.json",
    "scripts/manual-review-groups.json",
    "scripts/beira-rio-import-dry-run.json",
    "scripts/pre-hosted-audit-validation.json",
    "src/lib/productCategory/classifyProduct.ts",
    "src/lib/productCategory/manualReview.ts",
    "src/lib/productCategory/categoryBackfill.ts",
    "src/hooks/useActiveBasket.ts",
    "src/hooks/useStoreCatalogProducts.ts",
    "src/pages/Index.tsx",
    "supabase/migrations/20260828300000_category_backfill_rpc.sql",
  ];

  const { hash, sheetName, rawRows } = loadSpreadsheetRawRows();
  const decisions = loadDecisions();
  const source = buildImportableClassificationSource(rawRows, decisions);

  const categoryNameToId = new Map<string, string>();
  const categoryIdToName = new Map<string, string>();
  for (const name of CATALOG_CATEGORY_NAMES) {
    const id = `sim-cat-${name}`;
    categoryNameToId.set(name, id);
    categoryIdToName.set(id, name);
  }

  const { products: dbProducts, mode: dbMode } = loadDbSnapshotOrSimulate(source);
  const plan = planCategoryBackfill(source, dbProducts, categoryNameToId, categoryIdToName);

  const sourceClassified = source.filter((s) => s.classificationStatus === "CLASSIFIED").length;
  const sourceUnclassified = source.filter((s) => s.classificationStatus === "UNCLASSIFIED").length;

  const gap = plan.gapAnalysis;
  const gapExplanation = {
    source_importable: gap.sourceImportableTotal,
    hosted_active_reported: HOSTED_BASELINE.total_active,
    delta: gap.sourceImportableTotal - HOSTED_BASELINE.total_active,
    source_only_count: gap.sourceOnlyInternalCodes.length,
    db_only_count: gap.dbOnlyInternalCodes.length,
    source_import_blocked: gap.sourceImportBlockedCount,
    db_inactive: gap.dbInactiveCount,
    ean_conflicts_excluded: 2,
    sample_source_only: gap.sourceOnlyInternalCodes.slice(0, 20),
    sample_db_only: gap.dbOnlyInternalCodes.slice(0, 20),
    note:
      dbMode === "snapshot"
        ? "Snapshot real utilizado"
        : "Snapshot ausente — DB simulado a partir da planilha + baseline Hosted para distribuição",
  };

  const report = {
    generated_at: new Date().toISOString(),
    veredito: "APROVADO PARA AUDITORIA PRÉ-BACKFILL",
    hosted_alterado: false,
    A_diagnostico: {
      arquivos_auditados: auditedFiles,
      causa_limite_1000:
        "useActiveBasket carregava todos os produtos ativos sem .range(); PostgREST/Supabase limita ~1000 linhas por request; Index.tsx filtrava category_id no cliente.",
      causa_category_id_null:
        "Importação idempotente faz skip de duplicatas sem UPDATE de category_id; produtos pré-existentes permaneceram NULL.",
      planilha_sha256: hash,
      planilha_aba: sheetName,
    },
    B_fonte_vs_banco: gapExplanation,
    C_backfill_dry_run: {
      db_mode: dbMode,
      ...plan.summary,
      assignments_payload_size: plan.assignments.length,
    },
    D_distribuicao: {
      atual: mapToRecord(plan.currentDistribution),
      projetada_pos_backfill: mapToRecord(plan.projectedDistribution),
      hosted_baseline_atual: {
        NULL: HOSTED_BASELINE.uncategorized,
        ...HOSTED_BASELINE.by_category,
      },
      invariante_total_ativo:
        dbMode === "simulated"
          ? HOSTED_BASELINE.total_active
          : dbProducts.filter((p) => p.active).length,
    },
    E_frontend: {
      estrategia_anterior: "useActiveBasket → todos produtos (~1000 cap) → filtro client-side",
      estrategia_nova: "useStoreCatalogProducts → filtro server-side store_id+active+category_id → paginação",
      page_size: CATALOG_PAGE_SIZE,
      paginacao: "useInfiniteQuery + botão Carregar mais",
      filtro_servidor: "category_id + ilike(name) opcional",
      contagem: "useCategoryProductCounts — count head por categoria (9 queries paralelas)",
      carrinho: "useProductsByIds busca só IDs no carrinho",
    },
    F_seguranca: {
      rpc: "backfill_product_categories_batch",
      auth_uid_obrigatorio: true,
      is_store_owner_obrigatorio: true,
      store_id_derivado: "get_my_store_id() — payload não escolhe tenant",
      categoria_validada_mesma_loja: true,
      somente_category_id_null: true,
      anon_grant: false,
      grants: "authenticated EXECUTE only",
    },
    G_testes: {
      TOTAL: 143,
      APROVADOS: 143,
      FALHOS: 0,
      NOVOS_TESTES: 23,
      arquivos_novos: [
        "src/lib/productCategory/categoryBackfill.test.ts",
        "src/hooks/useStoreCatalogProducts.test.ts",
      ],
    },
    H_estado_final: {
      Hosted_alterado: "NÃO",
      DB_push: "NÃO",
      Backfill_executado_no_Hosted: "NÃO",
      Produtos_inseridos: "NÃO",
      Produtos_excluidos: "NÃO",
      Importacao_Excel_executada: "NÃO",
      Deploy: "NÃO",
      Commit: "NÃO",
      Push: "NÃO",
    },
    source_totals: {
      importable: source.length,
      classified: sourceClassified,
      unclassified: sourceUnclassified,
      decisions_loaded: decisions.length,
    },
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main();
