import { parseBrazilianPrice } from "@/lib/productImport/parseBrazilianPrice";
import {
  normalizeIdentifier,
  normalizeProductName,
} from "@/lib/productImport/normalize";
import { classifyProductName } from "@/lib/productCategory/classifyProduct";
import {
  annotateSpreadsheetDuplicates,
  isMeaningfulBarcode,
} from "@/lib/productImport/dedupe";
import type {
  ImportPreviewStats,
  ImportableProduct,
  ParsedImportRow,
} from "@/lib/productImport/types";

export interface ExistingProductIdentifiers {
  internalCodes: Set<string>;
  barcodes: Set<string>;
  namesLower: Set<string>;
}

export interface RawSpreadsheetRow {
  rowNumber: number;
  internalCode: string;
  barcode: string;
  name: string;
  priceRaw: string;
}

function isRowEmpty(row: RawSpreadsheetRow): boolean {
  return (
    !row.internalCode.trim() &&
    !row.barcode.trim() &&
    !row.name.trim() &&
    !row.priceRaw.trim()
  );
}

function buildStats(rows: ParsedImportRow[], skippedEmptyRows: number): ImportPreviewStats {
  const exactDuplicateRows = rows.filter((r) => r.status === "EXACT_DUPLICATE").length;
  const codeConflictRows = rows.filter((r) => r.status === "CODE_CONFLICT").length;
  const barcodeConflictRows = rows.filter((r) => r.status === "BARCODE_CONFLICT").length;
  const legacyDup = rows.filter((r) => r.status === "DUPLICATE").length;

  return {
    totalRows: rows.length,
    validRows: rows.filter((r) => r.status === "VALID").length,
    invalidRows: rows.filter((r) => r.status === "INVALID").length,
    exactDuplicateRows,
    codeConflictRows,
    barcodeConflictRows,
    duplicateRows: exactDuplicateRows + codeConflictRows + barcodeConflictRows + legacyDup,
    duplicateExistingRows: rows.filter((r) => r.status === "DUPLICATE_EXISTING").length,
    warningRows: rows.filter((r) => r.status === "WARNING").length,
    skippedEmptyRows,
    classifiedRows: rows.filter(
      (r) => r.status === "VALID" && r.classificationStatus === "CLASSIFIED",
    ).length,
    reviewRequiredRows: rows.filter(
      (r) => r.status === "VALID" && r.classificationStatus === "REVIEW_REQUIRED",
    ).length,
    unclassifiedRows: rows.filter(
      (r) => r.status === "VALID" && r.classificationStatus === "UNCLASSIFIED",
    ).length,
  };
}

function mapDedupeKindToStatus(
  kind: string,
): ParsedImportRow["status"] | null {
  switch (kind) {
    case "DUPLICATA_EXATA":
      return "EXACT_DUPLICATE";
    case "CONFLITO_DE_CODIGO":
      return "CODE_CONFLICT";
    case "CONFLITO_DE_CODIGO_BARRAS":
      return "BARCODE_CONFLICT";
    default:
      return null;
  }
}

export function validateSpreadsheetRows(
  rawRows: RawSpreadsheetRow[],
  existing?: ExistingProductIdentifiers,
): { rows: ParsedImportRow[]; stats: ImportPreviewStats } {
  const parsed: ParsedImportRow[] = [];
  let skippedEmptyRows = 0;

  for (const raw of rawRows) {
    if (isRowEmpty(raw)) {
      skippedEmptyRows += 1;
      continue;
    }

    const internalCode = normalizeIdentifier(raw.internalCode);
    const barcode = normalizeIdentifier(raw.barcode);
    const name = normalizeProductName(raw.name);
    const messages: string[] = [];
    let status: ParsedImportRow["status"] = "VALID";
    let price: string | null = null;
    let priceDisplay = raw.priceRaw.trim();

    if (!internalCode) {
      status = "INVALID";
      messages.push("Código vazio");
    }

    if (!name) {
      status = "INVALID";
      messages.push("Produto vazio");
    }

    const priceResult = parseBrazilianPrice(raw.priceRaw);
    if (!priceResult.ok) {
      status = "INVALID";
      messages.push(priceResult.error);
    } else {
      price = priceResult.value;
      priceDisplay = priceResult.value;
    }

    parsed.push({
      rowNumber: raw.rowNumber,
      internalCode,
      barcode,
      name,
      priceDisplay,
      price,
      status,
      messages,
    });
  }

  // Classificação determinística
  for (const row of parsed) {
    if (row.status === "INVALID") continue;
    const classification = classifyProductName(row.name);
    row.classificationStatus = classification.status;
    row.suggestedCategoryName = classification.categoryName;
    row.classificationReason = classification.reason;
    if (classification.status === "REVIEW_REQUIRED" || classification.status === "UNCLASSIFIED") {
      row.messages.push(`Categoria: ${classification.reason}`);
    } else if (classification.categoryName) {
      row.messages.push(`Categoria sugerida: ${classification.categoryName}`);
    }
  }

  // Deduplicação auditável (não trata barcode "0" como identidade)
  const eligibleForDedupe = parsed.filter((r) => r.status !== "INVALID");
  const { annotations } = annotateSpreadsheetDuplicates(
    eligibleForDedupe.map((r) => ({
      rowNumber: r.rowNumber,
      internalCode: r.internalCode,
      barcode: r.barcode,
      name: r.name,
      price: r.price,
    })),
  );

  for (const row of parsed) {
    if (row.status === "INVALID") continue;
    const ann = annotations.get(row.rowNumber);
    if (!ann) continue;
    row.dedupeKind = ann.kind;
    const mapped = mapDedupeKindToStatus(ann.kind);
    if (mapped) {
      row.status = mapped;
      if (ann.message) row.messages.push(ann.message);
    }
  }

  // Produtos já existentes na mesma loja (código / barcode significativo)
  // Nome igual sozinho NÃO bloqueia importação — só aviso.
  if (existing) {
    for (const row of parsed) {
      if (row.status !== "VALID") continue;

      if (row.internalCode && existing.internalCodes.has(row.internalCode)) {
        row.status = "DUPLICATE_EXISTING";
        row.messages.push(`Código ${row.internalCode} já existe na loja`);
        continue;
      }

      if (
        isMeaningfulBarcode(row.barcode) &&
        existing.barcodes.has(row.barcode)
      ) {
        row.status = "DUPLICATE_EXISTING";
        row.messages.push(`Código de barras ${row.barcode} já existe na loja`);
        continue;
      }

      if (existing.namesLower.has(row.name.toLowerCase())) {
        row.messages.push(
          `Aviso: nome "${row.name}" já existe na loja com outro código — importação não bloqueada`,
        );
      }
    }
  }

  return {
    rows: parsed,
    stats: buildStats(parsed, skippedEmptyRows),
  };
}

export function getImportableProducts(
  rows: ParsedImportRow[],
  categoryIdByName?: Map<string, string>,
): ImportableProduct[] {
  return rows
    .filter((row) => row.status === "VALID" && row.price != null)
    .map((row) => {
      const classified =
        row.classificationStatus === "CLASSIFIED" && row.suggestedCategoryName
          ? categoryIdByName?.get(row.suggestedCategoryName) ?? null
          : null;

      return {
        internal_code: row.internalCode,
        barcode: row.barcode,
        name: row.name,
        price: row.price!,
        sourceRow: row.rowNumber,
        category_id: classified,
        classification_status: row.classificationStatus ?? "UNCLASSIFIED",
      };
    });
}

export function hasCriticalSpreadsheetErrors(stats: ImportPreviewStats): boolean {
  // Conflitos não bloqueiam importação dos VALID; só falta de válidos bloqueia
  return stats.validRows === 0;
}
