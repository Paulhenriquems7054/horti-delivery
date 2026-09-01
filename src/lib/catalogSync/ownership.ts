/**
 * Ownership de campos — política inicial PDV vs HortiDelivery.
 */

export type HortiOwnedFields = {
  categoryId: string | null;
  imageUrl?: string | null;
  description?: string | null;
  featured?: boolean | null;
  displayOrder?: number | null;
};

export type PdvOwnedPatch = {
  name?: string;
  price?: number | null;
  active?: boolean | null;
  internalCode?: string | null;
  barcode?: string | null;
};

export const FIELD_OWNERSHIP = {
  name: "pdv",
  price: "pdv",
  active: "pdv",
  internalCode: "pdv",
  barcode: "pdv",
  categoryId: "horti",
  imageUrl: "horti",
  description: "horti",
  featured: "horti",
  displayOrder: "horti",
} as const;

/**
 * Ausência de categoria externa → preservar category_id.
 * Produto novo sem categoria → NULL permitido.
 */
export function resolveCategoryIdAfterSync(
  existingCategoryId: string | null | undefined,
  isNewProduct: boolean,
  allowCategoryFromPdv: boolean,
  resolvedExternalCategoryId: string | null,
): string | null {
  if (allowCategoryFromPdv && resolvedExternalCategoryId) {
    return resolvedExternalCategoryId;
  }
  if (existingCategoryId != null && existingCategoryId !== "") {
    return existingCategoryId;
  }
  return isNewProduct ? null : (existingCategoryId ?? null);
}

export function applyPdvPatchPreservingHorti<T extends HortiOwnedFields & PdvOwnedPatch>(
  existing: T,
  patch: PdvOwnedPatch,
): T {
  return {
    ...existing,
    name: patch.name ?? existing.name,
    price: patch.price ?? existing.price,
    active: patch.active ?? existing.active,
    internalCode: patch.internalCode ?? existing.internalCode,
    barcode: patch.barcode ?? existing.barcode,
    categoryId: existing.categoryId,
    imageUrl: existing.imageUrl,
    description: existing.description,
    featured: existing.featured,
    displayOrder: existing.displayOrder,
  };
}
