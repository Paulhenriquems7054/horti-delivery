import type { BasketProduct } from "@/hooks/useActiveBasket";

export const HORTIFRUTI_CATEGORY = "Hortifrúti";

const DEFAULT_AVG_WEIGHT = 0.3;
const DEFAULT_WEIGHT_VARIANCE = 0.15;

export function normalizeCategoryName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export function isHortifrutiCategory(categoryName: string | null | undefined): boolean {
  if (!categoryName) return false;
  return normalizeCategoryName(categoryName) === normalizeCategoryName(HORTIFRUTI_CATEGORY);
}

/** Resolve modo de venda efetivo (importações legadas de hortifrúti ficam só como unit no banco). */
export function resolveSellBy(
  sellBy: string | null | undefined,
  categoryName?: string | null,
): BasketProduct["sell_by"] {
  const raw = (sellBy || "unit") as BasketProduct["sell_by"];
  if (raw === "both" || raw === "weight") return raw;
  if (isHortifrutiCategory(categoryName)) return "both";
  return "unit";
}

/** Preenche preços por kg/unidade quando o produto permite escolha kg ou unidade. */
export function normalizeProductSelling(
  product: BasketProduct,
  categoryName?: string | null,
): BasketProduct {
  const sell_by = resolveSellBy(product.sell_by, categoryName);
  const average_weight = product.average_weight ?? DEFAULT_AVG_WEIGHT;
  const weight_variance = product.weight_variance ?? DEFAULT_WEIGHT_VARIANCE;

  let price_per_unit = product.price_per_unit;
  let price_per_kg = product.price_per_kg;
  const basePrice = product.price;

  if (sell_by === "both") {
    price_per_unit = price_per_unit ?? basePrice;
    if (price_per_kg == null && price_per_unit != null && average_weight > 0) {
      price_per_kg = price_per_unit / average_weight;
    } else {
      price_per_kg = price_per_kg ?? basePrice;
    }
    if (price_per_unit == null && price_per_kg != null) {
      price_per_unit = price_per_kg * average_weight;
    }
  } else if (sell_by === "weight") {
    price_per_kg = price_per_kg ?? basePrice;
  }

  return {
    ...product,
    sell_by,
    average_weight,
    weight_variance,
    price_per_kg,
    price_per_unit,
    min_weight: product.min_weight ?? 0.25,
    step_weight: product.step_weight ?? 0.25,
  };
}
