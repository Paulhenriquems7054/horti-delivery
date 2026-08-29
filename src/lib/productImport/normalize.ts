/** Normaliza cabeçalhos para comparação exata (sem fuzzy matching). */
export function normalizeSpreadsheetHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

const HEADER_ALIASES: Record<string, "internalCode" | "barcode" | "name" | "price"> = {
  codigo: "internalCode",
  "codigo de barras": "barcode",
  produto: "name",
  "preco de venda": "price",
};

export type BeiraRioColumnKey = "internalCode" | "barcode" | "name" | "price";

export interface ResolvedBeiraRioColumns {
  internalCode: number;
  barcode: number;
  name: number;
  price: number;
}

export function resolveBeiraRioColumns(headers: string[]): {
  ok: true;
  columns: ResolvedBeiraRioColumns;
} | {
  ok: false;
  missingColumns: string[];
} {
  const columns: Partial<ResolvedBeiraRioColumns> = {};
  const found = new Set<BeiraRioColumnKey>();

  headers.forEach((header, index) => {
    const normalized = normalizeSpreadsheetHeader(header);
    const key = HEADER_ALIASES[normalized];
    if (!key || found.has(key)) return;
    columns[key] = index;
    found.add(key);
  });

  const missingColumns: string[] = [];
  if (columns.internalCode === undefined) missingColumns.push("Código");
  if (columns.barcode === undefined) missingColumns.push("Código de Barras");
  if (columns.name === undefined) missingColumns.push("Produto");
  if (columns.price === undefined) missingColumns.push("Preço de Venda");

  if (missingColumns.length > 0) {
    return { ok: false, missingColumns };
  }

  return {
    ok: true,
    columns: columns as ResolvedBeiraRioColumns,
  };
}

/** Normaliza nome do produto sem alterar caracteres significativos (# etc.). */
export function normalizeProductName(value: string): string {
  return value
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Converte valor de célula para string preservando zeros à esquerda quando possível. */
export function cellValueToString(value: unknown, formattedText?: string): string {
  if (formattedText != null && formattedText !== "") {
    return String(formattedText).trim();
  }
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    if (Number.isInteger(value)) {
      return String(Math.trunc(value));
    }
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

export function normalizeIdentifier(value: string): string {
  return value
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}
