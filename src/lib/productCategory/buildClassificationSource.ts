/**
 * Constrói a fonte auditável de classificação a partir da planilha + overlay manual.
 * Não altera o Hosted — usado por dry-run e backfill local.
 */

import {
  getImportableProducts,
  validateSpreadsheetRows,
  type RawSpreadsheetRow,
} from "@/lib/productImport/validateRows";
import type { CatalogCategoryName } from "./classifyProduct";
import {
  categoryOverlayFromDecisions,
  makeReviewId,
  type ManualReviewDecision,
} from "./manualReview";
import type { ClassificationSourceRecord } from "./categoryBackfill";

export function applyManualClassificationOverlayToRows(
  rows: ReturnType<typeof validateSpreadsheetRows>["rows"],
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

export function buildClassificationSourceFromSpreadsheet(
  rawRows: RawSpreadsheetRow[],
  decisions: ManualReviewDecision[] = [],
): ClassificationSourceRecord[] {
  const { rows } = validateSpreadsheetRows(rawRows);
  applyManualClassificationOverlayToRows(rows, decisions);

  return rows
    .filter((row) => row.status === "VALID" || row.status === "BARCODE_CONFLICT" || row.status === "CODE_CONFLICT")
    .map((row) => ({
      internalCode: row.internalCode,
      barcode: row.barcode,
      name: row.name,
      classificationStatus: row.classificationStatus ?? "UNCLASSIFIED",
      categoryName: row.suggestedCategoryName ?? null,
      sourceRow: row.rowNumber,
      importBlocked:
        row.status === "BARCODE_CONFLICT" ||
        row.status === "CODE_CONFLICT" ||
        row.status === "EXACT_DUPLICATE" ||
        row.status === "INVALID",
      spreadsheetStatus: row.status,
    }));
}

export function buildImportableClassificationSource(
  rawRows: RawSpreadsheetRow[],
  decisions: ManualReviewDecision[] = [],
): ClassificationSourceRecord[] {
  const { rows } = validateSpreadsheetRows(rawRows);
  applyManualClassificationOverlayToRows(rows, decisions);
  const importable = getImportableProducts(rows);

  const byCode = new Map(
    rows
      .filter((r) => r.status === "VALID")
      .map((r) => [r.internalCode, r] as const),
  );

  return importable.map((p) => {
    const row = byCode.get(p.internal_code);
    return {
      internalCode: p.internal_code,
      barcode: p.barcode,
      name: p.name,
      classificationStatus: p.classification_status,
      categoryName: (row?.suggestedCategoryName ?? null) as CatalogCategoryName | null,
      sourceRow: p.sourceRow,
      importBlocked: false,
      spreadsheetStatus: "VALID" as const,
    };
  });
}
