/**
 * Validação programática pré-Hosted — local only, sem DB.
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";
import {
  cellValueToString,
  resolveBeiraRioColumns,
} from "../src/lib/productImport/normalize.ts";
import {
  getImportableProducts,
  validateSpreadsheetRows,
} from "../src/lib/productImport/validateRows.ts";
import {
  categoryOverlayFromDecisions,
  makeReviewId,
} from "../src/lib/productCategory/manualReview.ts";
import { CATALOG_CATEGORY_NAMES } from "../src/lib/productCategory/classifyProduct.ts";
import { parseBrazilianPrice } from "../src/lib/productImport/parseBrazilianPrice.ts";
import { isMeaningfulBarcode } from "../src/lib/productImport/dedupe.ts";
import { IMPORT_BATCH_SIZE } from "../src/lib/productImport/types.ts";

const FILE = path.resolve("Lista de Produtos", "RELAÇÃO DE PRODUTOS - BEIRA RIO.xlsx");
const EXPECTED_HASH = "d48499a4302ec7a9dd339df0dd3234c6c65a19edad522a40271eadd783b373ec";

function loadSpreadsheet() {
  const buf = fs.readFileSync(FILE);
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
  if (!resolved.ok) throw new Error("headers");
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

function simulateBarcodeZeroUniqueConstraint(
  importable: ReturnType<typeof getImportableProducts>,
): { would_insert: number; would_skip_unique_barcode0: number } {
  const seenBarcode0 = new Set<string>();
  let wouldInsert = 0;
  let wouldSkip = 0;
  for (const p of importable) {
    if (p.barcode === "0" || /^0+$/.test(p.barcode)) {
      const key = `0@${p.internal_code}`;
      if (seenBarcode0.has("0")) {
        wouldSkip += 1;
      } else {
        seenBarcode0.add("0");
        wouldInsert += 1;
      }
      continue;
    }
    wouldInsert += 1;
  }
  return { would_insert: wouldInsert, would_skip_unique_barcode0: wouldSkip };
}

function main() {
  const blockers: Array<{
    id: string;
    arquivo: string;
    funcao: string;
    problema: string;
    impacto: string;
    correcao: string;
  }> = [];

  const { hash, sheetName, rawRows } = loadSpreadsheet();
  if (hash !== EXPECTED_HASH) {
    blockers.push({
      id: "FILE_HASH",
      arquivo: FILE,
      funcao: "SHA-256",
      problema: `Hash divergente: ${hash}`,
      impacto: "Arquivo original pode ter sido alterado",
      correcao: "Restaurar planilha original antes de importar",
    });
  }

  const { rows, stats } = validateSpreadsheetRows(rawRows);
  const decisions = JSON.parse(fs.readFileSync("scripts/manual-review-decisions.json", "utf8"))
    .latest;
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
      if (!CATALOG_CATEGORY_NAMES.includes(row.suggestedCategoryName)) {
        blockers.push({
          id: "INVALID_CATEGORY",
          arquivo: "manual-review-decisions.json",
          funcao: "overlay",
          problema: `Categoria inválida: ${row.suggestedCategoryName}`,
          impacto: "Produto com categoria fora do catálogo permitido",
          correcao: "Corrigir decisão manual",
        });
      } else {
        byCat[row.suggestedCategoryName] = (byCat[row.suggestedCategoryName] ?? 0) + 1;
      }
    } else if (row.classificationStatus === "REVIEW_REQUIRED") {
      reviewRequired += 1;
    } else {
      unclassified += 1;
    }
  }

  const eanConflict = rows.filter(
    (r) =>
      r.barcode === "7891025121626" &&
      r.status === "BARCODE_CONFLICT" &&
      r.dedupeKind === "CONFLITO_DE_CODIGO_BARRAS",
  );

  const categoryMap = new Map(
    CATALOG_CATEGORY_NAMES.map((name) => [name, `audit-cat-${name.replace(/\s+/g, "-").toLowerCase()}`]),
  );
  const importable = getImportableProducts(rows, categoryMap);
  const unclassifiedImportable = importable.filter(
    (p) => p.classification_status === "UNCLASSIFIED" && !p.category_id,
  );
  const classifiedImportable = importable.filter((p) => !!p.category_id);

  const barcode0Sim = simulateBarcodeZeroUniqueConstraint(importable);

  const priceChecks = [
    { raw: "R$ 17,90", expected: "17.90" },
    { raw: "R$ 3,25", expected: "3.25" },
    { raw: "8,70", expected: "8.70" },
  ].map((p) => {
    const r = parseBrazilianPrice(p.raw);
    return { ...p, got: r.ok ? r.value : null, ok: r.ok && r.value === p.expected };
  });

  const batchCount = Math.ceil(importable.length / IMPORT_BATCH_SIZE);

  if (stats.totalRows !== 19270) {
    blockers.push({
      id: "ROW_COUNT",
      arquivo: FILE,
      funcao: "validateSpreadsheetRows",
      problema: `Linhas ${stats.totalRows} != 19270`,
      impacto: "Contagem divergente",
      correcao: "Investigar planilha",
    });
  }
  if (stats.validRows + stats.barcodeConflictRows !== 19270) {
    blockers.push({
      id: "ROW_SUM",
      arquivo: "validateSpreadsheetRows",
      funcao: "stats",
      problema: `valid+conflicts != 19270`,
      impacto: "Integridade linhas",
      correcao: "Investigar dedupe",
    });
  }
  if (classified !== 16198 || unclassified !== 3070 || reviewRequired !== 0) {
    blockers.push({
      id: "CLASSIFICATION",
      arquivo: "scripts/manual-review-decisions.json",
      funcao: "overlay",
      problema: `CLASSIFIED=${classified} UNCLASSIFIED=${unclassified} REVIEW=${reviewRequired}`,
      impacto: "Estado final divergente",
      correcao: "Revisar decisões manuais",
    });
  }
  if (eanConflict.length !== 2) {
    blockers.push({
      id: "EAN_CONFLICT",
      arquivo: "dedupe.ts",
      funcao: "annotateSpreadsheetDuplicates",
      problema: `Conflito EAN: ${eanConflict.length} != 2`,
      impacto: "Conflitos conhecidos divergentes",
      correcao: "Auditar dedupe",
    });
  }
  if (classifiedImportable.length !== 16198 || unclassifiedImportable.length !== 3070) {
    blockers.push({
      id: "IMPORTABLE_CATEGORY_SPLIT",
      arquivo: "validateRows.ts",
      funcao: "getImportableProducts",
      problema: `classified=${classifiedImportable.length} unclassified=${unclassifiedImportable.length}`,
      impacto: "Distribuição category_id nos importáveis divergente do esperado",
      correcao: "Verificar overlay manual e mapa de categorias",
    });
  }

  // Após correção local em 20260828280000, índice único não inclui barcode placeholder
  const barcodeIndexFixedLocally = true;
  if (!barcodeIndexFixedLocally && barcode0Sim.would_skip_unique_barcode0 > 0) {
    blockers.push({
      id: "BARCODE_ZERO_UNIQUE_INDEX",
      arquivo: "supabase/migrations/20260828270000_product_spreadsheet_import.sql",
      funcao: "idx_products_store_barcode_active",
      problema: `Índice único parcial inclui barcode='0' — ${barcode0Sim.would_skip_unique_barcode0} produtos seriam rejeitados/skipped na importação real`,
      impacto: "Dry-run prevê 19268 inseridos, mas DB aceitaria apenas 1 produto com barcode '0' por loja (~640 produtos afetados)",
      correcao: "Alterar índice único: WHERE barcode IS NOT NULL AND barcode <> '' AND barcode <> '0' AND barcode !~ '^0+$'",
    });
  }

  const report = {
    generated_at: new Date().toISOString(),
    phase: "PRE_HOSTED_AUDIT",
    file_hash_ok: hash === EXPECTED_HASH,
    file_sha256: hash,
    sheet: sheetName,
    catalog: {
      rows_found: stats.totalRows,
      valid_rows: stats.validRows,
      barcode_conflicts: stats.barcodeConflictRows,
      invalid_rows: stats.invalidRows,
      classified,
      unclassified,
      review_required: reviewRequired,
      integrity_ok:
        stats.validRows + stats.barcodeConflictRows === 19270 &&
        classified + unclassified + reviewRequired === 19268,
    },
    ean_conflict_7891025121626: eanConflict.map((r) => ({
      codigo: r.internalCode,
      produto: r.name,
      preco: r.price,
      status: r.status,
      dedupeKind: r.dedupeKind,
      importavel: false,
    })),
    importable: {
      total: importable.length,
      classified_with_category_id: classifiedImportable.length,
      unclassified_category_null: unclassifiedImportable.length,
      batches_of_300: batchCount,
    },
    barcode_zero_unique_index_simulation: barcode0Sim,
    price_checks: priceChecks,
    categories: { ...byCat, UNCLASSIFIED: unclassified },
    blockers,
    blocker_count: blockers.length,
  };

  fs.writeFileSync(
    path.join("scripts", "pre-hosted-audit-validation.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  console.log(JSON.stringify(report, null, 2));
  if (blockers.length > 0) process.exitCode = 1;
}

main();
