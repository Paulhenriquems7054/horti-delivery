/**
 * Política de ownership de campos entre PDV e HortiDelivery.
 */

export type FieldOwner = "pdv" | "horti" | "pdv_if_present";

export const CATALOG_FIELD_OWNERSHIP = {
  name: "pdv",
  price: "pdv",
  active: "pdv",
  internalCode: "pdv",
  barcode: "pdv",
  inStock: "pdv",
  categoryId: "horti",
  imageUrl: "horti",
  description: "horti",
  featured: "horti",
  displayOrder: "horti",
  /** Categoria externa só aplica se integração habilitar explicitamente */
  externalCategory: "pdv_if_present",
} as const satisfies Record<string, FieldOwner>;

export type OwnedProductFields = {
  name: string;
  price: number;
  active: boolean;
  internalCode: string | null;
  barcode: string | null;
  inStock?: boolean | null;
  categoryId: string | null;
  imageUrl?: string | null;
  description?: string | null;
};

export type PdvProductPatch = Partial<
  Pick<OwnedProductFields, "name" | "price" | "active" | "internalCode" | "barcode" | "inStock">
>;

/**
 * Mescla campos vindos do PDV preservando campos Horti (ex.: category_id).
 */
export function mergePdvIntoExisting(
  existing: OwnedProductFields,
  pdvPatch: PdvProductPatch,
  options?: { allowCategoryFromPdv?: boolean; externalCategoryId?: string | null },
): OwnedProductFields {
  return {
    ...existing,
    name: pdvPatch.name ?? existing.name,
    price: pdvPatch.price ?? existing.price,
    active: pdvPatch.active ?? existing.active,
    internalCode: pdvPatch.internalCode ?? existing.internalCode,
    barcode: pdvPatch.barcode ?? existing.barcode,
    inStock: pdvPatch.inStock ?? existing.inStock,
    categoryId:
      options?.allowCategoryFromPdv && options.externalCategoryId
        ? options.externalCategoryId
        : existing.categoryId,
  };
}

/**
 * PDV não envia categoria → preserva category_id atual.
 */
export function resolveCategoryAfterSync(
  existingCategoryId: string | null,
  externalCategory?: { externalId?: string; name?: string },
  allowCategoryFromPdv = false,
): string | null {
  if (!allowCategoryFromPdv) return existingCategoryId;
  if (!externalCategory?.externalId && !externalCategory?.name) return existingCategoryId;
  return existingCategoryId;
}
