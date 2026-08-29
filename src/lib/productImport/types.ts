export type ImportRowStatus =
  | "VALID"
  | "INVALID"
  | "DUPLICATE"
  | "DUPLICATE_EXISTING"
  | "WARNING";

export interface ParsedImportRow {
  rowNumber: number;
  internalCode: string;
  barcode: string;
  name: string;
  priceDisplay: string;
  price: string | null;
  status: ImportRowStatus;
  messages: string[];
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
  duplicateRows: number;
  duplicateExistingRows: number;
  warningRows: number;
  skippedEmptyRows: number;
}

export interface ImportableProduct {
  internal_code: string;
  barcode: string;
  name: string;
  price: string;
  sourceRow: number;
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
