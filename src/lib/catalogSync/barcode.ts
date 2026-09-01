import { isMeaningfulBarcode } from "@/lib/productImport/dedupe";

export { isMeaningfulBarcode };

export function normalizeBarcode(barcode: string | null | undefined): string | null {
  if (barcode == null) return null;
  const b = barcode.trim();
  return isMeaningfulBarcode(b) ? b : null;
}
