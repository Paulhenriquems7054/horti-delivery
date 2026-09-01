import { normalizeBarcode } from "./barcode";
import type {
  CatalogProductRef,
  CatalogSyncDecision,
  CatalogSyncReasonCode,
  ExternalIdentifierRow,
  NormalizedCatalogProduct,
  ResolveCatalogSyncContext,
} from "./types";

export function externalIdentityKey(
  storeId: string,
  provider: string,
  externalId: string,
): string {
  return `${storeId}\u0000${provider}\u0000${externalId}`;
}

export function buildExternalIndex(rows: ExternalIdentifierRow[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const row of rows) {
    if (row.storeId) {
      index.set(
        externalIdentityKey(row.storeId, row.provider, row.externalId),
        row.productId,
      );
    }
  }
  return index;
}

export function productsForStore(
  products: CatalogProductRef[],
  storeId: string,
): CatalogProductRef[] {
  return products.filter((p) => p.storeId === storeId);
}

function invalidPrice(price: number | null | undefined): boolean {
  if (price == null) return false;
  if (!Number.isFinite(price)) return true;
  if (price < 0) return true;
  if (price > 1_000_000) return true;
  return false;
}

function findByInternalCode(
  products: CatalogProductRef[],
  internalCode: string | null | undefined,
): { productId: string | null; conflict: boolean } {
  const code = internalCode?.trim();
  if (!code) return { productId: null, conflict: false };
  const matches = products.filter((p) => p.internalCode?.trim() === code);
  if (matches.length === 1) return { productId: matches[0].id, conflict: false };
  if (matches.length > 1) return { productId: null, conflict: true };
  return { productId: null, conflict: false };
}

function findByBarcode(
  products: CatalogProductRef[],
  barcode: string | null | undefined,
): { productId: string | null; conflict: boolean } {
  const bc = normalizeBarcode(barcode);
  if (!bc) return { productId: null, conflict: false };
  const matches = products.filter((p) => normalizeBarcode(p.barcode) === bc);
  if (matches.length === 1) return { productId: matches[0].id, conflict: false };
  if (matches.length > 1) return { productId: null, conflict: true };
  return { productId: null, conflict: false };
}

function rejectCrossTenant(
  productId: string | null,
  products: CatalogProductRef[],
  storeId: string,
): boolean {
  if (!productId) return false;
  const product = products.find((p) => p.id === productId);
  return !product || product.storeId !== storeId;
}

export function resolveCatalogSyncAction(
  incoming: NormalizedCatalogProduct,
  ctx: ResolveCatalogSyncContext,
): CatalogSyncDecision {
  const extId = incoming.externalId?.trim();
  if (!extId) {
    return {
      action: "ERROR",
      reasonCode: "MISSING_EXTERNAL_ID",
      externalId: incoming.externalId ?? "",
    };
  }

  if (invalidPrice(incoming.price)) {
    return {
      action: "SKIP",
      reasonCode: "INVALID_PRICE",
      externalId: extId,
    };
  }

  const storeProducts = productsForStore(ctx.products, ctx.storeId);
  const storeExternalIds = ctx.externalIdentifiers.filter((r) => r.storeId === ctx.storeId);
  const externalIndex = buildExternalIndex(storeExternalIds);

  const extKey = externalIdentityKey(ctx.storeId, ctx.provider, extId);
  const byExternal = externalIndex.get(extKey);

  if (byExternal) {
    if (rejectCrossTenant(byExternal, ctx.products, ctx.storeId)) {
      return {
        action: "CONFLICT",
        reasonCode: "CROSS_TENANT_REJECTED",
        externalId: extId,
        productId: byExternal,
      };
    }
    const product = storeProducts.find((p) => p.id === byExternal);
    if (!product) {
      return {
        action: "CONFLICT",
        reasonCode: "PRODUCT_NOT_IN_CONTEXT",
        externalId: extId,
        productId: byExternal,
        matchedBy: "external_id",
      };
    }
    if (incoming.active === false && product.active !== false) {
      return {
        action: "UPDATE",
        reasonCode: "DEACTIVATE_REQUESTED",
        externalId: extId,
        productId: byExternal,
        matchedBy: "external_id",
      };
    }
    return {
      action: "UPDATE",
      reasonCode: "EXTERNAL_ID_MATCH",
      externalId: extId,
      productId: byExternal,
      matchedBy: "external_id",
    };
  }

  const dupExternal = storeExternalIds.some(
    (r) =>
      r.provider === ctx.provider &&
      r.externalId === extId &&
      r.storeId === ctx.storeId,
  );
  if (dupExternal) {
    return {
      action: "CONFLICT",
      reasonCode: "DUPLICATE_EXTERNAL_ID",
      externalId: extId,
    };
  }

  const byCode = findByInternalCode(storeProducts, incoming.internalCode);
  if (byCode.conflict) {
    return {
      action: "CONFLICT",
      reasonCode: "DUPLICATE_INTERNAL_CODE",
      externalId: extId,
    };
  }
  if (byCode.productId) {
    if (rejectCrossTenant(byCode.productId, ctx.products, ctx.storeId)) {
      return {
        action: "CONFLICT",
        reasonCode: "CROSS_TENANT_REJECTED",
        externalId: extId,
        productId: byCode.productId,
      };
    }
    return {
      action: "UPDATE",
      reasonCode: "INTERNAL_CODE_MATCH",
      externalId: extId,
      productId: byCode.productId,
      matchedBy: "internal_code",
    };
  }

  const byBarcode = findByBarcode(storeProducts, incoming.barcode);
  if (byBarcode.conflict) {
    return {
      action: "CONFLICT",
      reasonCode: "IDENTITY_CONFLICT",
      externalId: extId,
    };
  }
  if (byBarcode.productId) {
    if (rejectCrossTenant(byBarcode.productId, ctx.products, ctx.storeId)) {
      return {
        action: "CONFLICT",
        reasonCode: "CROSS_TENANT_REJECTED",
        externalId: extId,
        productId: byBarcode.productId,
      };
    }
    return {
      action: "UPDATE",
      reasonCode: "BARCODE_MATCH",
      externalId: extId,
      productId: byBarcode.productId,
      matchedBy: "barcode",
    };
  }

  if (!incoming.name?.trim()) {
    return {
      action: "ERROR",
      reasonCode: "MISSING_NAME",
      externalId: extId,
    };
  }

  return {
    action: "CREATE",
    reasonCode: "CREATE_NEW",
    externalId: extId,
  };
}

/** Nome nunca é identidade — decisão explícita para comparação por nome. */
export function findByName(
  products: CatalogProductRef[],
  name: string,
): string | null {
  const n = name.trim().toLowerCase();
  const matches = products.filter((p) => p.name.trim().toLowerCase() === n);
  if (matches.length === 1) return matches[0].id;
  return null;
}

export function resolveIdempotentReplay(
  first: CatalogSyncDecision,
  second: CatalogSyncDecision,
): boolean {
  return first.action === "CREATE" && (second.action === "UPDATE" || second.action === "SKIP");
}

export type { CatalogSyncReasonCode };
