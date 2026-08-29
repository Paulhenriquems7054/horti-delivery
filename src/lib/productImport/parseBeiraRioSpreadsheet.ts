import * as XLSX from "xlsx";
import { resolveBeiraRioColumns, cellValueToString } from "@/lib/productImport/normalize";
import type { RawSpreadsheetRow } from "@/lib/productImport/validateRows";
import type { SpreadsheetParseResult } from "@/lib/productImport/types";
import {
  ACCEPTED_SPREADSHEET_EXTENSIONS,
  ACCEPTED_SPREADSHEET_MIME_TYPES,
  MAX_SPREADSHEET_BYTES,
} from "@/lib/productImport/types";
import { validateSpreadsheetRows, type ExistingProductIdentifiers } from "@/lib/productImport/validateRows";

function getFileExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  if (idx === -1) return "";
  return filename.slice(idx).toLowerCase();
}

async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") {
    return file.arrayBuffer();
  }

  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler arquivo"));
      reader.readAsArrayBuffer(file);
    });
  }

  return new Response(file).arrayBuffer();
}

export function validateSpreadsheetFile(file: File): string | null {
  const ext = getFileExtension(file.name);
  if (!ACCEPTED_SPREADSHEET_EXTENSIONS.includes(ext as (typeof ACCEPTED_SPREADSHEET_EXTENSIONS)[number])) {
    return "Formato não suportado. Use arquivos .xls ou .xlsx.";
  }

  if (file.size > MAX_SPREADSHEET_BYTES) {
    return `Arquivo muito grande. O limite é ${MAX_SPREADSHEET_BYTES / (1024 * 1024)} MB.`;
  }

  if (file.type && !ACCEPTED_SPREADSHEET_MIME_TYPES.includes(file.type as (typeof ACCEPTED_SPREADSHEET_MIME_TYPES)[number])) {
    return "Tipo MIME do arquivo não é compatível com planilhas Excel.";
  }

  return null;
}

function getCellDisplay(sheet: XLSX.WorkSheet, row: number, col: number): string {
  const address = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[address];
  if (!cell) return "";
  return cellValueToString(cell.v, cell.w);
}

function sheetToRawRows(sheet: XLSX.WorkSheet): RawSpreadsheetRow[] | { error: string; missingColumns?: string[] } {
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });

  if (matrix.length === 0) {
    return { error: "A planilha está vazia." };
  }

  const headerRow = matrix[0].map((cell) => cellValueToString(cell));
  const resolved = resolveBeiraRioColumns(headerRow);
  if (!resolved.ok) {
    return {
      error: `Colunas obrigatórias não encontradas: ${resolved.missingColumns.join(", ")}`,
      missingColumns: resolved.missingColumns,
    };
  }

  const { columns } = resolved;
  const rows: RawSpreadsheetRow[] = [];

  for (let i = 1; i < matrix.length; i += 1) {
    const excelRowNumber = i + 1;
    rows.push({
      rowNumber: excelRowNumber,
      internalCode: getCellDisplay(sheet, i, columns.internalCode),
      barcode: getCellDisplay(sheet, i, columns.barcode),
      name: getCellDisplay(sheet, i, columns.name),
      priceRaw: getCellDisplay(sheet, i, columns.price),
    });
  }

  return rows;
}

export async function parseBeiraRioSpreadsheetFile(
  file: File,
  existing?: ExistingProductIdentifiers,
): Promise<SpreadsheetParseResult> {
  const fileError = validateSpreadsheetFile(file);
  if (fileError) {
    return { ok: false, error: fileError };
  }

  const buffer = await readFileAsArrayBuffer(file);
  if (buffer.byteLength > MAX_SPREADSHEET_BYTES) {
    return { ok: false, error: "Arquivo excede o tamanho máximo permitido." };
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: "array",
      cellDates: true,
    });
  } catch {
    return { ok: false, error: "Não foi possível ler a planilha. Verifique se o arquivo está íntegro." };
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    return { ok: false, error: "Nenhuma planilha encontrada no arquivo." };
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    return { ok: false, error: "Não foi possível acessar a primeira planilha do arquivo." };
  }

  const rawResult = sheetToRawRows(sheet);
  if ("error" in rawResult) {
    return {
      ok: false,
      error: rawResult.error,
      missingColumns: rawResult.missingColumns,
    };
  }

  const { rows, stats } = validateSpreadsheetRows(rawResult, existing);

  return {
    ok: true,
    rows,
    stats,
  };
}

/** Utilitário para testes — monta workbook em memória. */
export function buildWorkbookFromRows(headers: string[], dataRows: string[][]): ArrayBuffer {
  const aoa = [headers, ...dataRows];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Produtos");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
