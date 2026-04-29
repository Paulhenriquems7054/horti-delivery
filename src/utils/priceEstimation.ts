import type { BasketProduct } from "@/hooks/useActiveBasket";
import { getEffectivePricePerKg, getEffectiveProductPrice } from "@/utils/productPricing";

/** Venda com preço unitário fechado (R$ do cadastro), não por kg+peso estimado. */
export function sellsByUnitFixedPrice(
  product: { sell_by?: string; unit?: string | null }
): boolean {
  if (product.sell_by === "unit") return true;
  const u = (product.unit || "").toLowerCase();
  return u === "un" || u === "und" || u === "unidade";
}

export interface PriceEstimate {
  estimated: number;
  min: number;
  max: number;
  hasEstimate: boolean;
}

export function calculateUnitPriceEstimate(
  product: BasketProduct,
  quantity: number = 1
): PriceEstimate {
  if (sellsByUnitFixedPrice(product)) {
    return {
      estimated: 0,
      min: 0,
      max: 0,
      hasEstimate: false,
    };
  }

  const pricePerKg = getEffectivePricePerKg(product);
  const averageWeight = product.average_weight;
  const variance = product.weight_variance ?? 0.15;

  if (!averageWeight || averageWeight <= 0) {
    return {
      estimated: 0,
      min: 0,
      max: 0,
      hasEstimate: false,
    };
  }

  const estimatedUnitPrice = averageWeight * pricePerKg;
  const minWeight = averageWeight * (1 - variance);
  const maxWeight = averageWeight * (1 + variance);

  return {
    estimated: estimatedUnitPrice * quantity,
    min: minWeight * pricePerKg * quantity,
    max: maxWeight * pricePerKg * quantity,
    hasEstimate: true,
  };
}

export function calculateCartEstimate(
  products: BasketProduct[],
  cart: Record<string, number>,
  weightCart: Record<string, number>,
  productMode: Record<string, "unit" | "weight">
): {
  weightItemsTotal: number;
  unitItemsEstimate: number;
  unitItemsMin: number;
  unitItemsMax: number;
  totalEstimate: number;
  totalMin: number;
  totalMax: number;
  hasUnitEstimates: boolean;
  /** Só itens cujo valor por unidade vem de peso médio (não preço fixo) */
  hasUnitWeightBasedEstimate: boolean;
  unitItemsWithoutEstimate: number;
} {
  let weightItemsTotal = 0;
  let unitItemsEstimate = 0;
  let unitItemsMin = 0;
  let unitItemsMax = 0;
  let unitItemsWithoutEstimate = 0;
  let hasUnitWeightBasedEstimate = false;

  products.forEach((p) => {
    const sellBy = p.sell_by || "unit";
    const mode = sellBy === "both" ? productMode[p.id] || "unit" : sellBy;

    if (mode === "weight") {
      const kg = weightCart[p.id] || 0;
      const pricePerKg = getEffectivePricePerKg(p);
      weightItemsTotal += kg * pricePerKg;
    } else {
      const qty = cart[p.id] || 0;
      if (qty > 0) {
        if (sellsByUnitFixedPrice(p)) {
          const unitPrice = getEffectiveProductPrice(p);
          const line = qty * unitPrice;
          unitItemsEstimate += line;
          unitItemsMin += line;
          unitItemsMax += line;
        } else {
          const estimate = calculateUnitPriceEstimate(p, qty);
          if (estimate.hasEstimate) {
            hasUnitWeightBasedEstimate = true;
            unitItemsEstimate += estimate.estimated;
            unitItemsMin += estimate.min;
            unitItemsMax += estimate.max;
          } else {
            unitItemsWithoutEstimate += qty;
          }
        }
      }
    }
  });

  return {
    weightItemsTotal,
    unitItemsEstimate,
    unitItemsMin,
    unitItemsMax,
    totalEstimate: weightItemsTotal + unitItemsEstimate,
    totalMin: weightItemsTotal + unitItemsMin,
    totalMax: weightItemsTotal + unitItemsMax,
    hasUnitEstimates: unitItemsEstimate > 0,
    hasUnitWeightBasedEstimate,
    unitItemsWithoutEstimate,
  };
}

export function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

export function formatPriceRange(min: number, max: number): string {
  if (Math.abs(max - min) < 0.5) {
    return formatCurrency((min + max) / 2);
  }
  return `${formatCurrency(min)} – ${formatCurrency(max)}`;
}
