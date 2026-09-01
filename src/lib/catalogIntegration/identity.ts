import { isMeaningfulBarcode } from "@/lib/productImport/dedupe";

export type ProductIdentityRef = {
  id: string;
  internalCode: string | null;
  barcode: string | null;
};

export type ExternalIdentityRef = {
  provider: string;
  externalId: string;
  internalCode?: string | null;
  barcode?: string | null;
};

export type ExternalIdIndex = Map<string, string>;
/** provider:externalId → productId */
export function buildExternalIdIndex(
  rows: Array<{ provider: string; externalId: string; productId: string }>,
): ExternalIdIndex {
  const index = new Map<string, string>();
  for (const row of rows) {
    index.set(`${row.provider}:${row.externalId}`, row.productId);
  }
  return index;
}

export function resolveProductIdentity(
  storeProducts: ProductIdentityRef[],
  external: ExternalIdentityRef,
  externalIndex: ExternalIdIndex,
): { productId: string | null; matchedBy: "external_id" | "internal_code" | "barcode" | null } {
  const extKey = `${external.provider}:${external.externalId}`;
  const byExternal = externalIndex.get(extKey);
  if (byExternal) {
    return { productId: byExternal, matchedBy: "external_id" };
  }

  const code = external.internalCode?.trim();
  if (code) {
    const matches = storeProducts.filter((p) => p.internalCode?.trim() === code);
    if (matches.length === 1) {
      return { productId: matches[0].id, matchedBy: "internal_code" };
    }
    if (matches.length > 1) {
      return { productId: null, matchedBy: null };
    }
  }

  const bc = external.barcode?.trim() ?? "";
  if (isMeaningfulBarcode(bc)) {
    const matches = storeProducts.filter((p) => p.barcode?.trim() === bc);
    if (matches.length === 1) {
      return { productId: matches[0].id, matchedBy: "barcode" };
    }
  }

  return { productId: null, matchedBy: null };
}

export function isDuplicateInternalCodeConflict(
  storeProducts: ProductIdentityRef[],
  internalCode: string,
  excludeProductId?: string,
): boolean {
  const code = internalCode.trim();
  if (!code) return false;
  const matches = storeProducts.filter((p) => p.internalCode?.trim() === code);
  if (excludeProductId) {
    return matches.some((p) => p.id !== excludeProductId);
  }
  return matches.length > 1;
}

export function externalIdKey(provider: string, externalId: string, storeId: string): string {
  return `${storeId}:${provider}:${externalId}`;
}
