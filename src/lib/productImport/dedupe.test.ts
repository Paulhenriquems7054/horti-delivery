import { describe, expect, it } from "vitest";
import {
  annotateSpreadsheetDuplicates,
  isMeaningfulBarcode,
  rowFingerprint,
} from "@/lib/productImport/dedupe";

describe("isMeaningfulBarcode", () => {
  it("rejeita placeholders", () => {
    expect(isMeaningfulBarcode("")).toBe(false);
    expect(isMeaningfulBarcode("0")).toBe(false);
    expect(isMeaningfulBarcode("0000")).toBe(false);
  });

  it("aceita EAN real", () => {
    expect(isMeaningfulBarcode("7898115755600")).toBe(true);
    expect(isMeaningfulBarcode("0789123456789")).toBe(true);
  });
});

describe("annotateSpreadsheetDuplicates", () => {
  it("mantém uma ocorrência em duplicata exata", () => {
    const { annotations, stats } = annotateSpreadsheetDuplicates([
      { rowNumber: 2, internalCode: "1", barcode: "111", name: "A", price: "1.00" },
      { rowNumber: 3, internalCode: "1", barcode: "111", name: "A", price: "1.00" },
    ]);
    expect(stats.exactDuplicateExtras).toBe(1);
    expect(annotations.get(2)?.keepForImport).toBe(true);
    expect(annotations.get(3)?.kind).toBe("DUPLICATA_EXATA");
  });

  it("marca conflito de código", () => {
    const { annotations } = annotateSpreadsheetDuplicates([
      { rowNumber: 2, internalCode: "1", barcode: "111", name: "A", price: "1.00" },
      { rowNumber: 3, internalCode: "1", barcode: "222", name: "B", price: "2.00" },
    ]);
    expect(annotations.get(2)?.kind).toBe("CONFLITO_DE_CODIGO");
    expect(annotations.get(3)?.kind).toBe("CONFLITO_DE_CODIGO");
  });

  it("ignora barcode 0 compartilhado", () => {
    const { annotations, stats } = annotateSpreadsheetDuplicates([
      { rowNumber: 2, internalCode: "1", barcode: "0", name: "A", price: "1.00" },
      { rowNumber: 3, internalCode: "2", barcode: "0", name: "B", price: "2.00" },
    ]);
    expect(stats.barcodeConflictGroups).toBe(0);
    expect(annotations.get(2)?.kind).toBe("PRODUTO_UNICO");
    expect(annotations.get(3)?.kind).toBe("PRODUTO_UNICO");
  });

  it("fingerprint ignora placeholder barcode", () => {
    const a = rowFingerprint({ internalCode: "1", barcode: "0", name: "A", price: "1.00" });
    const b = rowFingerprint({ internalCode: "1", barcode: "", name: "A", price: "1.00" });
    expect(a).toBe(b);
  });
});
