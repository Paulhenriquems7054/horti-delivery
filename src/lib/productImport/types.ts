export type ImportRowStatus =
  | "VALID"
  | "INVALID"
  | "EXACT_DUPLICATE"
  | "CODE_CONFLICT"
  | "BARCODE_CONFLICT"
  | "DUPLICATE_EXISTING"
  | "WARNING"
  /** @deprecated use EXACT_DUPLICATE / CODE_CONFLICT / BARCODE_CONFLICT */
  | "DUPLICATE";

export interface ParsedImportRow {
  rowNumber: number;
  internalCode: string;
  barcode: string;
  name: string;
  priceDisplay: string;
  price: string | null;
  status: ImportRowStatus;
  messages: string[];
  classificationStatus?: "CLASSIFIED" | "REVIEW_REQUIRED" | "UNCLASSIFIED";
  suggestedCategoryName?: string | null;
  classificationReason?: string;
  dedupeKind?: string;
}

export type SpreadsheetParseResult =
  | {
      ok: true;
      rows: ParsedImportRow[];
      stats: ImportPreviewStats;
    }
  | {
      ok: false;
      error: string;
      missingColumns?: string[];
    };

export interface ImportPreviewStats {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  /** extras exatos removidos do lote (mantém 1) */
  exactDuplicateRows: number;
  codeConflictRows: number;
  barcodeConflictRows: number;
  /** @deprecated soma legada — preferir campos específicos */
  duplicateRows: number;
  duplicateExistingRows: number;
  warningRows: number;
  skippedEmptyRows: number;
  classifiedRows: number;
  reviewRequiredRows: number;
  unclassifiedRows: number;
}

export interface ImportableProduct {
  internal_code: string;
  barcode: string;
  name: string;
  price: string;
  sourceRow: number;
  category_id?: string | null;
  classification_status?: string;
}

export const BEIRA_RIO_REQUIRED_COLUMNS = [
  "Código",
  "Código de Barras",
  "Produto",
  "Preço de Venda",
] as const;

export const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_SPREADSHEET_EXTENSIONS = [".xls", ".xlsx"] as const;

export const ACCEPTED_SPREADSHEET_MIME_TYPES = [
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
] as const;

export const IMPORT_BATCH_SIZE = 300;
