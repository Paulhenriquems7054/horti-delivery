/**
 * Deduplicação auditável da planilha Beira Rio.
 * Só remove automaticamente DUPLICATA_EXATA (mantém 1 ocorrência).
 * Conflitos ficam para revisão — nunca apagados em silêncio.
 */

export type DedupeKind =
  | "PRODUTO_UNICO"
  | "DUPLICATA_EXATA"
  | "CONFLITO_DE_CODIGO"
  | "CONFLITO_DE_CODIGO_BARRAS"
  | "POSSIVEL_DUPLICIDADE";

/** Códigos de barras placeholder que NÃO identificam produto. */
const PLACEHOLDER_BARCODES = new Set([
  "",
  "0",
  "00",
  "000",
  "0000",
  "00000",
  "000000",
  "0000000",
  "00000000",
]);

export function isMeaningfulBarcode(barcode: string): boolean {
  const b = barcode.trim();
  if (!b) return false;
  if (PLACEHOLDER_BARCODES.has(b)) return false;
  // só zeros
  if (/^0+$/.test(b)) return false;
  return true;
}

export function rowFingerprint(parts: {
  internalCode: string;
  barcode: string;
  name: string;
  price: string | null;
}): string {
  const bc = isMeaningfulBarcode(parts.barcode) ? parts.barcode : "";
  return [
    parts.internalCode,
    bc,
    parts.name.toLowerCase(),
    parts.price ?? "",
  ].join("\u0001");
}

export interface DedupeInputRow {
  rowNumber: number;
  internalCode: string;
  barcode: string;
  name: string;
  price: string | null;
}

export interface DedupeAnnotation {
  rowNumber: number;
  kind: DedupeKind;
  /** true = pode entrar no lote de importação (se também for VALID na validação) */
  keepForImport: boolean;
  message?: string;
}

/**
 * Analisa duplicidades:
 * - DUPLICATA_EXATA: mesmo código + barcode significativo + nome + preço → mantém a 1ª, demais excluídas
 * - CONFLITO_DE_CODIGO: mesmo código, dados diferentes
 * - CONFLITO_DE_CODIGO_BARRAS: mesmo barcode significativo, dados diferentes
 * Placeholder barcode "0" NÃO gera conflito de barcode.
 */
export function annotateSpreadsheetDuplicates(rows: DedupeInputRow[]): {
  annotations: Map<number, DedupeAnnotation>;
  stats: {
    unique: number;
    exactDuplicateExtras: number;
    exactDuplicateGroups: number;
    codeConflictRows: number;
    codeConflictGroups: number;
    barcodeConflictRows: number;
    barcodeConflictGroups: number;
  };
} {
  const annotations = new Map<number, DedupeAnnotation>();
  const byFp = new Map<string, DedupeInputRow[]>();
  const byCode = new Map<string, DedupeInputRow[]>();
  const byBarcode = new Map<string, DedupeInputRow[]>();

  for (const row of rows) {
    annotations.set(row.rowNumber, {
      rowNumber: row.rowNumber,
      kind: "PRODUTO_UNICO",
      keepForImport: true,
    });

    if (!row.internalCode || !row.name || row.price == null) continue;

    const fp = rowFingerprint(row);
    const fpList = byFp.get(fp) ?? [];
    fpList.push(row);
    byFp.set(fp, fpList);

    const codeList = byCode.get(row.internalCode) ?? [];
    codeList.push(row);
    byCode.set(row.internalCode, codeList);

    if (isMeaningfulBarcode(row.barcode)) {
      const bcList = byBarcode.get(row.barcode) ?? [];
      bcList.push(row);
      byBarcode.set(row.barcode, bcList);
    }
  }

  let exactDuplicateExtras = 0;
  let exactDuplicateGroups = 0;
  for (const [, list] of byFp) {
    if (list.length < 2) continue;
    exactDuplicateGroups += 1;
    // keep first occurrence (lowest row number)
    const sorted = [...list].sort((a, b) => a.rowNumber - b.rowNumber);
    for (let i = 1; i < sorted.length; i += 1) {
      const row = sorted[i]!;
      exactDuplicateExtras += 1;
      annotations.set(row.rowNumber, {
        rowNumber: row.rowNumber,
        kind: "DUPLICATA_EXATA",
        keepForImport: false,
        message: `Duplicata exata da linha ${sorted[0]!.rowNumber} (código ${row.internalCode})`,
      });
    }
  }

  let codeConflictRows = 0;
  let codeConflictGroups = 0;
  for (const [code, list] of byCode) {
    const candidates = list.filter((r) => {
      const a = annotations.get(r.rowNumber);
      return a?.kind === "PRODUTO_UNICO" || a?.kind === "DUPLICATA_EXATA";
    });
    // consider only rows still conceptually in the sheet with same code but different fingerprints among keepers+exact
    const uniqueFps = new Set(
      list.filter((r) => r.price != null && r.name).map((r) => rowFingerprint(r)),
    );
    if (uniqueFps.size < 2) continue;
    codeConflictGroups += 1;
    for (const row of list) {
      const current = annotations.get(row.rowNumber);
      if (!current) continue;
      if (current.kind === "DUPLICATA_EXATA") continue; // exact extras already handled
      codeConflictRows += 1;
      annotations.set(row.rowNumber, {
        rowNumber: row.rowNumber,
        kind: "CONFLITO_DE_CODIGO",
        keepForImport: false,
        message: `Código ${code} aparece com dados diferentes em ${uniqueFps.size} variantes`,
      });
    }
  }

  let barcodeConflictRows = 0;
  let barcodeConflictGroups = 0;
  for (const [barcode, list] of byBarcode) {
    const uniqueFps = new Set(
      list.filter((r) => r.price != null && r.name).map((r) => rowFingerprint(r)),
    );
    if (uniqueFps.size < 2) continue;
    barcodeConflictGroups += 1;
    for (const row of list) {
      const current = annotations.get(row.rowNumber);
      if (!current) continue;
      if (current.kind === "DUPLICATA_EXATA" || current.kind === "CONFLITO_DE_CODIGO") {
        // já marcado com prioridade maior; ainda conta no grupo de barcode
        continue;
      }
      barcodeConflictRows += 1;
      annotations.set(row.rowNumber, {
        rowNumber: row.rowNumber,
        kind: "CONFLITO_DE_CODIGO_BARRAS",
        keepForImport: false,
        message: `Código de barras ${barcode} aparece com dados diferentes em ${uniqueFps.size} variantes`,
      });
    }
  }

  let unique = 0;
  for (const a of annotations.values()) {
    if (a.kind === "PRODUTO_UNICO" && a.keepForImport) unique += 1;
  }

  return {
    annotations,
    stats: {
      unique,
      exactDuplicateExtras,
      exactDuplicateGroups,
      codeConflictRows,
      codeConflictGroups,
      barcodeConflictRows,
      barcodeConflictGroups,
    },
  };
}
