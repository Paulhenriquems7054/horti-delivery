import type { ExternalCatalogProduct, CatalogSyncItemResult, CatalogSyncSummary } from "./types";
import { resolveProductIdentity, isDuplicateInternalCodeConflict, type ProductIdentityRef } from "./identity";
import { mergePdvIntoExisting, resolveCategoryAfterSync, type OwnedProductFields } from "./ownership";

export type SyncEngineContext = {
  storeId: string;
  provider: string;
  /** productId → registro atual */
  productsById: Map<string, OwnedProductFields & { id: string }>;
  /** lista para matching por código/EAN */
  storeProducts: ProductIdentityRef[];
  /** provider:externalId → productId */
  externalIndex: Map<string, string>;
  allowCategoryFromPdv?: boolean;
  resolveExternalCategoryId?: (category?: ExternalCatalogProduct["category"]) => string | null;
};

export function validateExternalPrice(price: number): { ok: true; value: number } | { ok: false; reason: string } {
  if (!Number.isFinite(price)) return { ok: false, reason: "price_not_finite" };
  if (price < 0) return { ok: false, reason: "price_negative" };
  if (price > 1_000_000) return { ok: false, reason: "price_out_of_range" };
  return { ok: true, value: Math.round(price * 100) / 100 };
}

export function planCatalogSyncItem(
  external: ExternalCatalogProduct,
  ctx: SyncEngineContext,
): CatalogSyncItemResult {
  if (!external.externalId?.trim()) {
    return { action: "CONFLICT", externalId: external.externalId ?? "", reason: "missing_external_id" };
  }

  const priceCheck = validateExternalPrice(external.price);
  if (!priceCheck.ok) {
    return { action: "SKIP", externalId: external.externalId, reason: priceCheck.reason };
  }

  if (
    external.internalCode &&
    isDuplicateInternalCodeConflict(ctx.storeProducts, external.internalCode)
  ) {
    const resolved = resolveProductIdentity(ctx.storeProducts, {
      provider: ctx.provider,
      externalId: external.externalId,
      internalCode: external.internalCode,
      barcode: external.barcode,
    }, ctx.externalIndex);

    if (!resolved.productId) {
      return {
        action: "CONFLICT",
        externalId: external.externalId,
        reason: "duplicate_internal_code",
      };
    }
  }

  const match = resolveProductIdentity(
    ctx.storeProducts,
    {
      provider: ctx.provider,
      externalId: external.externalId,
      internalCode: external.internalCode,
      barcode: external.barcode,
    },
    ctx.externalIndex,
  );

  if (!match.productId) {
    if (!external.name?.trim()) {
      return { action: "SKIP", externalId: external.externalId, reason: "missing_name_for_create" };
    }
    return { action: "CREATE", externalId: external.externalId };
  }

  const existing = ctx.productsById.get(match.productId);
  if (!existing) {
    return { action: "CONFLICT", externalId: external.externalId, reason: "product_not_in_context" };
  }

  if (external.active === false && existing.active) {
    return { action: "DEACTIVATE", externalId: external.externalId, productId: match.productId };
  }

  return { action: "UPDATE", externalId: external.externalId, productId: match.productId };
}

export function applyPdvPatchToExisting(
  existing: OwnedProductFields & { id: string },
  external: ExternalCatalogProduct,
  ctx: SyncEngineContext,
): OwnedProductFields & { id: string } {
  const externalCategoryId = ctx.resolveExternalCategoryId?.(external.category) ?? null;
  const categoryId = resolveCategoryAfterSync(
    existing.categoryId,
    external.category,
    ctx.allowCategoryFromPdv,
  );

  const merged = mergePdvIntoExisting(
    existing,
    {
      name: external.name,
      price: external.price,
      active: external.active,
      internalCode: external.internalCode ?? existing.internalCode,
      barcode: external.barcode ?? existing.barcode,
    },
    {
      allowCategoryFromPdv: ctx.allowCategoryFromPdv,
      externalCategoryId: externalCategoryId ?? categoryId,
    },
  );

  return { ...merged, id: existing.id };
}

export function runCatalogSyncPlan(
  items: ExternalCatalogProduct[],
  ctx: SyncEngineContext,
): CatalogSyncSummary {
  const results: CatalogSyncItemResult[] = items.map((item) => planCatalogSyncItem(item, ctx));

  const summary: CatalogSyncSummary = {
    created: 0,
    updated: 0,
    skipped: 0,
    conflicts: 0,
    deactivated: 0,
    errors: 0,
    items: results,
  };

  for (const r of results) {
    switch (r.action) {
      case "CREATE":
        summary.created += 1;
        break;
      case "UPDATE":
        summary.updated += 1;
        break;
      case "SKIP":
        summary.skipped += 1;
        break;
      case "CONFLICT":
        summary.conflicts += 1;
        break;
      case "DEACTIVATE":
        summary.deactivated += 1;
        break;
      default:
        summary.errors += 1;
    }
  }

  return summary;
}

/**
 * Idempotência: segunda execução com mesmo índice externo não deve gerar CREATE duplicado.
 */
export function isIdempotentReplay(
  firstRun: CatalogSyncSummary,
  secondRun: CatalogSyncSummary,
): boolean {
  return firstRun.created > 0 && secondRun.created === 0 && secondRun.updated >= 0;
}
