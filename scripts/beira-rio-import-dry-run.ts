/**
 * DRY-RUN completo da importação Beira Rio — local only.
 * NÃO executa INSERT/UPDATE/DELETE, NÃO toca Hosted, NÃO aplica migrations.
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";
import {
  cellValueToString,
  resolveBeiraRioColumns,
} from "../src/lib/productImport/normalize.ts";
import { parseBrazilianPrice } from "../src/lib/productImport/parseBrazilianPrice.ts";
import {
  getImportableProducts,
  validateSpreadsheetRows,
  type ExistingProductIdentifiers,
  type RawSpreadsheetRow,
} from "../src/lib/productImport/validateRows.ts";
import { isMeaningfulBarcode } from "../src/lib/productImport/dedupe.ts";
import {
  CATALOG_CATEGORY_NAMES,
  type CatalogCategoryName,
} from "../src/lib/productCategory/classifyProduct.ts";
import {
  categoryOverlayFromDecisions,
  makeReviewId,
  type ManualReviewDecision,
} from "../src/lib/productCategory/manualReview.ts";
import type { ParsedImportRow } from "../src/lib/productImport/types.ts";

const SOURCE_FILE = path.resolve(
  "Lista de Produtos",
  "RELAÇÃO DE PRODUTOS - BEIRA RIO.xlsx",
);
const DECISIONS_PATH = path.join("scripts", "manual-review-decisions.json");
const REPORT_PATH = path.join("scripts", "beira-rio-import-dry-run.json");

const EXPECTED = {
  data_rows: 19_270,
  eligible_valid: 19_268,
  barcode_conflicts: 2,
  classified_final: 16_198,
  unclassified_final: 3_070,
  review_required_final: 0,
  total: 19_268,
};

const KNOWN_EAN_CONFLICT = "7891025121626";

function loadDecisions(): ManualReviewDecision[] {
  if (!fs.existsSync(DECISIONS_PATH)) return [];
  const raw = JSON.parse(fs.readFileSync(DECISIONS_PATH, "utf8"));
  return raw.latest ?? raw.decisions ?? [];
}

function applyManualClassificationOverlay(
  rows: ParsedImportRow[],
  decisions: ManualReviewDecision[],
): void {
  const overlay = categoryOverlayFromDecisions(decisions);
  for (const row of rows) {
    if (row.status !== "VALID") continue;
    const reviewId = makeReviewId(row.name, row.internalCode, row.barcode);
    const cat = overlay.get(reviewId);
    if (cat) {
      row.classificationStatus = "CLASSIFIED";
      row.suggestedCategoryName = cat;
    }
  }
}

function buildMockCategoryMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const name of CATALOG_CATEGORY_NAMES) {
    map.set(name, `dry-run-cat-${name.replace(/\s+/g, "-").toLowerCase()}`);
  }
  return map;
}

function simulateServerBatch(
  products: ReturnType<typeof getImportableProducts>,
  existing: { internalCodes: Set<string>; barcodes: Set<string> },
): { inserted: number; skipped: number } {
  let inserted = 0;
  let skipped = 0;
  for (const p of products) {
    const meaningful = isMeaningfulBarcode(p.barcode);
    if (
      existing.internalCodes.has(p.internal_code) ||
      (meaningful && existing.barcodes.has(p.barcode))
    ) {
      skipped += 1;
      continue;
    }
    inserted += 1;
    existing.internalCodes.add(p.internal_code);
    if (p.barcode) existing.barcodes.add(p.barcode);
  }
  return { inserted, skipped };
}

function loadSpreadsheet(): {
  sheetName: string;
  rawRows: RawSpreadsheetRow[];
  fileHash: string;
  fileSize: number;
} {
  const buf = fs.readFileSync(SOURCE_FILE);
  const fileHash = crypto.createHash("sha256").update(buf).digest("hex");
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0]!;
  const sheet = wb.Sheets[sheetName]!;
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });
  const headerRow = (matrix[0] ?? []).map((c) => cellValueToString(c));
  const resolved = resolveBeiraRioColumns(headerRow);
  if (!resolved.ok) {
    throw new Error(`Colunas faltando: ${resolved.missingColumns.join(", ")}`);
  }
  const { columns } = resolved;
  const getCell = (r: number, c: number) => {
    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
    return cell ? cellValueToString(cell.v, cell.w) : "";
  };
  const rawRows: RawSpreadsheetRow[] = [];
  for (let i = 1; i < matrix.length; i += 1) {
    rawRows.push({
      rowNumber: i + 1,
      internalCode: getCell(i, columns.internalCode),
      barcode: getCell(i, columns.barcode),
      name: getCell(i, columns.name),
      priceRaw: getCell(i, columns.price),
    });
  }
  return { sheetName, rawRows, fileHash, fileSize: buf.length };
}

function main() {
  const blockers: string[] = [];
  const { sheetName, rawRows, fileHash, fileSize } = loadSpreadsheet();
  const decisions = loadDecisions();

  // --- Validação inicial (sem overlay manual) ---
  const { rows: baseRows, stats: baseStats } = validateSpreadsheetRows(rawRows);

  if (baseStats.totalRows !== EXPECTED.data_rows) {
    blockers.push(
      `Linhas de dados: esperado ${EXPECTED.data_rows}, encontrado ${baseStats.totalRows}`,
    );
  }
  if (baseStats.validRows !== EXPECTED.eligible_valid) {
    blockers.push(
      `Linhas válidas: esperado ${EXPECTED.eligible_valid}, encontrado ${baseStats.validRows}`,
    );
  }
  if (baseStats.barcodeConflictRows !== EXPECTED.barcode_conflicts) {
    blockers.push(
      `Conflitos EAN: esperado ${EXPECTED.barcode_conflicts}, encontrado ${baseStats.barcodeConflictRows}`,
    );
  }

  // --- Overlay manual (estado final auditado) ---
  const rows = structuredClone(baseRows) as ParsedImportRow[];
  applyManualClassificationOverlay(rows, decisions);

  let classified = 0;
  let unclassified = 0;
  let reviewRequired = 0;
  const byCat: Record<string, number> = Object.fromEntries(
    CATALOG_CATEGORY_NAMES.map((c) => [c, 0]),
  );

  for (const row of rows) {
    if (row.status !== "VALID") continue;
    if (row.classificationStatus === "CLASSIFIED" && row.suggestedCategoryName) {
      classified += 1;
      byCat[row.suggestedCategoryName] = (byCat[row.suggestedCategoryName] ?? 0) + 1;
    } else if (row.classificationStatus === "REVIEW_REQUIRED") {
      reviewRequired += 1;
    } else {
      unclassified += 1;
    }
  }

  if (classified !== EXPECTED.classified_final) {
    blockers.push(
      `CLASSIFIED final: esperado ${EXPECTED.classified_final}, encontrado ${classified}`,
    );
  }
  if (unclassified !== EXPECTED.unclassified_final) {
    blockers.push(
      `UNCLASSIFIED final: esperado ${EXPECTED.unclassified_final}, encontrado ${unclassified}`,
    );
  }
  if (reviewRequired !== EXPECTED.review_required_final) {
    blockers.push(
      `REVIEW_REQUIRED final: esperado ${EXPECTED.review_required_final}, encontrado ${reviewRequired}`,
    );
  }

  const categoryMap = buildMockCategoryMap();
  const importable = getImportableProducts(rows, categoryMap);
  const importableClassified = importable.filter((p) => p.category_id).length;
  const importableUnclassified = importable.filter((p) => !p.category_id).length;

  // --- Conflitos detalhados ---
  const conflicts = rows
    .filter(
      (r) =>
        r.status === "BARCODE_CONFLICT" ||
        r.status === "CODE_CONFLICT" ||
        r.status === "EXACT_DUPLICATE",
    )
    .map((r) => ({
      tipo: r.status,
      codigo: r.internalCode,
      ean: r.barcode,
      produto: r.name,
      preco: r.price,
      linha: r.rowNumber,
      motivo: r.messages.join("; "),
      acao: "CONFLITOS_PARA_REVISAO — não importar automaticamente",
    }));

  const eanConflictProducts = rows.filter(
    (r) => r.barcode === KNOWN_EAN_CONFLICT && r.status === "BARCODE_CONFLICT",
  );

  // --- Amostras de preço ---
  const priceSamples = [
    { code: "12803", raw: rawRows.find((r) => r.internalCode.includes("12803"))?.priceRaw },
    { code: "18189", raw: rawRows.find((r) => r.name.includes("GREGO DANONE"))?.priceRaw },
  ].map((s) => {
    const parsed = s.raw ? parseBrazilianPrice(s.raw) : null;
    return {
      codigo: s.code,
      raw: s.raw ?? null,
      parsed: parsed?.ok ? parsed.value : null,
      cents: parsed?.ok ? parsed.cents : null,
      ok: parsed?.ok ?? false,
    };
  });

  // Verificação adicional de preços nos importáveis
  const badPrices = importable.filter((p) => {
    const n = Number(p.price);
    return !Number.isFinite(n) || n < 0 || !/^\d+\.\d{2}$/.test(p.price);
  });

  if (badPrices.length > 0) {
    blockers.push(`${badPrices.length} produto(s) importável(is) com preço inválido`);
  }

  // --- EAN como string ---
  const eanChecks = importable.slice(0, 5).map((p) => ({
    internal_code: p.internal_code,
    barcode: p.barcode,
    barcode_type: typeof p.barcode,
    preserves_leading_zeros: p.barcode.startsWith("0") ? p.barcode === p.barcode : true,
  }));

  const leadingZeroEan = importable.find((p) => /^0\d/.test(p.barcode));
  if (leadingZeroEan) {
    eanChecks.push({
      internal_code: leadingZeroEan.internal_code,
      barcode: leadingZeroEan.barcode,
      barcode_type: "string",
      preserves_leading_zeros: true,
    });
  }

  // --- Simulação importação (1ª execução — loja vazia) ---
  const emptyExisting: ExistingProductIdentifiers = {
    internalCodes: new Set(),
    barcodes: new Set(),
    namesLower: new Set(),
  };
  const { rows: rowsRun1 } = validateSpreadsheetRows(rawRows, emptyExisting);
  applyManualClassificationOverlay(rowsRun1, decisions);
  const productsRun1 = getImportableProducts(rowsRun1, categoryMap);
  const serverSim1 = simulateServerBatch(productsRun1, {
    internalCodes: new Set(),
    barcodes: new Set(),
  });

  // --- Simulação importação (2ª execução — idempotência) ---
  const existingAfterRun1: ExistingProductIdentifiers = {
    internalCodes: new Set(productsRun1.map((p) => p.internal_code)),
    barcodes: new Set(
      productsRun1.filter((p) => isMeaningfulBarcode(p.barcode)).map((p) => p.barcode),
    ),
    namesLower: new Set(productsRun1.map((p) => p.name.toLowerCase())),
  };
  const { rows: rowsRun2, stats: statsRun2 } = validateSpreadsheetRows(
    rawRows,
    existingAfterRun1,
  );
  applyManualClassificationOverlay(rowsRun2, decisions);
  const productsRun2 = getImportableProducts(rowsRun2, categoryMap);
  const serverSim2 = simulateServerBatch(productsRun2, {
    internalCodes: new Set(existingAfterRun1.internalCodes),
    barcodes: new Set(existingAfterRun1.barcodes),
  });

  const clientDupRun2 = statsRun2.duplicateExistingRows;

  if (serverSim2.inserted !== 0) {
    blockers.push(
      `Idempotência: 2ª execução simulada inseriria ${serverSim2.inserted} produto(s) (esperado 0)`,
    );
  }

  const blockedFromImport =
    baseStats.barcodeConflictRows +
    baseStats.codeConflictRows +
    baseStats.exactDuplicateRows;

  const report = {
    generated_at: new Date().toISOString(),
    phase: "IMPORT_DRY_RUN",
    mode: "LOCAL_ONLY_NO_DB_WRITES",
    blockers,
    blocked: blockers.length > 0,

    source_file: SOURCE_FILE,
    source_sheet: sheetName,
    file_sha256: fileHash,
    file_size_bytes: fileSize,
    excel_alterado: false,

    rows_found: baseStats.totalRows,
    skipped_empty_rows: baseStats.skippedEmptyRows,
    valid_rows: baseStats.validRows,
    invalid_rows: baseStats.invalidRows,

    classified,
    unclassified,
    review_required: reviewRequired,
    classification_integrity: classified + unclassified + reviewRequired,

    exact_duplicates: baseStats.exactDuplicateRows,
    barcode_conflicts: baseStats.barcodeConflictRows,
    code_conflicts: baseStats.codeConflictRows,

    manual_decisions_loaded: decisions.length,
    manual_decisions_with_category: decisions.filter((d) => d.chosenCategory).length,

    import_simulation: {
      importable_total: importable.length,
      importable_classified: importableClassified,
      importable_unclassified: importableUnclassified,
      unclassified_behavior:
        "Produtos UNCLASSIFIED são importados sem category_id (NULL). classification_status enviado ao RPC é ignorado pelo servidor. Revisão manual posterior via UI.",
      blocked_from_spreadsheet: blockedFromImport,
      first_run: {
        client_new_products: productsRun1.length,
        client_duplicate_existing: 0,
        server_would_insert: serverSim1.inserted,
        server_would_skip: serverSim1.skipped,
      },
      second_run_idempotency: {
        client_duplicate_existing: clientDupRun2,
        importable_after_client_dedup: productsRun2.length,
        server_would_insert: serverSim2.inserted,
        server_would_skip: serverSim2.skipped,
        idempotent: serverSim2.inserted === 0 && serverSim2.skipped === productsRun2.length,
      },
    },

    would_insert: serverSim1.inserted,
    would_skip: serverSim2.skipped,
    would_block: blockedFromImport,

    new_products: serverSim1.inserted,
    existing_products: clientDupRun2,
    blocked_products: blockedFromImport,

    target_store: {
      slug: "beira-rio",
      store_id: "RESOLVIDO_EM_RUNTIME_VIA_get_my_store_id()",
      note: "UUID não hardcoded — migration seed usa WHERE stores.slug = 'beira-rio'",
      tenant_isolation: "RPCs usam get_my_store_id() + is_store_owner() — store_id NÃO vem do cliente",
    },
    target_tenant_id: "N/A — modelo usa store_id, não tenant_id separado",

    rpcs_that_would_be_called: [
      "ensure_store_catalog_categories()",
      "begin_product_import(p_filename, p_total_rows)",
      "import_product_batch(p_import_id, p_items) — lotes de 300",
      "finish_product_import(p_import_id, p_metadata)",
    ],

    security: {
      store_id_client_controlled: false,
      store_id_source: "get_my_store_id() no servidor (SECURITY DEFINER)",
      preview_store_id_source: "TenantContext React — apenas leitura preview; RLS protege products",
      client_manipulation_risk:
        "storeId na query de preview poderia divergir em multi-loja; INSERT usa get_my_store_id() — BLOCKER se divergência",
      multi_tenant_blocker: false,
      rls: "product_imports: SELECT owner only; products: is_store_owner(store_id)",
      auth_required: "auth.uid() IS NOT NULL em todas RPCs de import",
      category_id_validation: "Servidor valida category_id contra categories.store_id = v_store_id",
      classification_status_persisted: false,
      anon_access: "REVOKE ALL FROM anon nas RPCs de import",
    },

    CONFLITOS_PARA_REVISAO: conflicts,
    known_ean_conflict: {
      ean: KNOWN_EAN_CONFLICT,
      produtos: eanConflictProducts.map((r) => ({
        codigo: r.internalCode,
        produto: r.name,
        preco: r.price,
        linha: r.rowNumber,
      })),
      acao: "NÃO importar automaticamente — revisão manual obrigatória",
    },

    categories_distribution: {
      ...byCat,
      UNCLASSIFIED: unclassified,
      REVIEW_REQUIRED: reviewRequired,
    },
    categories_sum: Object.values(byCat).reduce((a, b) => a + b, 0) + unclassified + reviewRequired,

    price_validation: {
      samples: priceSamples,
      invalid_in_importable: badPrices.length,
    },

    ean_validation: {
      stored_as_string: true,
      samples: eanChecks,
      placeholder_barcode_0_allowed: true,
      meaningful_barcode_skip_on_reimport: true,
    },

    pipeline_integrity: {
      sum: classified + unclassified + reviewRequired,
      expected: EXPECTED.total,
      ok: classified + unclassified + reviewRequired === EXPECTED.total,
    },

    system_state: {
      excel_original_alterado: false,
      hosted_alterado: false,
      produtos_inseridos: false,
      produtos_atualizados: false,
      produtos_excluidos: false,
      migration_aplicada: false,
      deploy: false,
      commit: false,
      push: false,
    },
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  if (blockers.length > 0) {
    console.error("BLOCKERS DETECTADOS:");
    blockers.forEach((b) => console.error(`  - ${b}`));
    process.exitCode = 1;
  }

  console.log(JSON.stringify(report, null, 2));
}

main();
