import type { BasketProduct } from "@/hooks/useActiveBasket";

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
  const pricePerKg = product.price_per_kg ?? product.price;
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
  unitItemsSubtotal: number;
  itemsSubtotal: number;
  unitItemsEstimate: number;
  unitItemsMin: number;
  unitItemsMax: number;
  totalEstimate: number;
  totalMin: number;
  totalMax: number;
  hasUnitEstimates: boolean;
  unitItemsWithoutEstimate: number;
} {
  let weightItemsTotal = 0;
  let unitItemsSubtotal = 0;
  let unitItemsEstimate = 0;
  let unitItemsMin = 0;
  let unitItemsMax = 0;
  let unitItemsWithoutEstimate = 0;

  products.forEach((p) => {
    const sellBy = p.sell_by || "unit";
    const mode = sellBy === "both" ? productMode[p.id] || "unit" : sellBy;

    if (mode === "weight") {
      const kg = weightCart[p.id] || 0;
      weightItemsTotal += kg * (p.price_per_kg ?? p.price);
    } else {
      const qty = cart[p.id] || 0;
      if (qty > 0) {
        unitItemsSubtotal += qty * (p.price_per_unit ?? p.price);
        const estimate = calculateUnitPriceEstimate(p, qty);
        if (estimate.hasEstimate) {
          unitItemsEstimate += estimate.estimated;
          unitItemsMin += estimate.min;
          unitItemsMax += estimate.max;
        } else {
          unitItemsWithoutEstimate += qty;
        }
      }
    }
  });

  return {
    weightItemsTotal,
    unitItemsSubtotal,
    itemsSubtotal: weightItemsTotal + unitItemsSubtotal,
    unitItemsEstimate,
    unitItemsMin,
    unitItemsMax,
    totalEstimate: weightItemsTotal + unitItemsEstimate,
    totalMin: weightItemsTotal + unitItemsMin,
    totalMax: weightItemsTotal + unitItemsMax,
    hasUnitEstimates: unitItemsEstimate > 0,
    unitItemsWithoutEstimate,
  };
}

export function cartLineSubtotal(
  product: BasketProduct,
  mode: "unit" | "weight",
  quantity: number,
  weightKg: number,
): number {
  if (mode === "weight") return weightKg * (product.price_per_kg ?? product.price);
  return quantity * (product.price_per_unit ?? product.price);
}

export function calculateCartLinesEstimate(resolvedLines: {
  soldBy: "unit" | "weight";
  quantity: number;
  weightKg: number;
  product: BasketProduct;
  lineSubtotal: number;
}[]) {
  let weightItemsTotal = 0;
  let unitItemsSubtotal = 0;
  let unitItemsEstimate = 0;
  let unitItemsMin = 0;
  let unitItemsMax = 0;
  let unitItemsWithoutEstimate = 0;

  for (const line of resolvedLines) {
    if (line.soldBy === "weight") {
      weightItemsTotal += line.lineSubtotal;
    } else {
      unitItemsSubtotal += line.lineSubtotal;
      const estimate = calculateUnitPriceEstimate(line.product, line.quantity);
      if (estimate.hasEstimate) {
        unitItemsEstimate += estimate.estimated;
        unitItemsMin += estimate.min;
        unitItemsMax += estimate.max;
      } else {
        unitItemsWithoutEstimate += line.quantity;
      }
    }
  }

  return {
    weightItemsTotal,
    unitItemsSubtotal,
    itemsSubtotal: weightItemsTotal + unitItemsSubtotal,
    unitItemsEstimate,
    unitItemsMin,
    unitItemsMax,
    totalEstimate: weightItemsTotal + unitItemsEstimate,
    totalMin: weightItemsTotal + unitItemsMin,
    totalMax: weightItemsTotal + unitItemsMax,
    hasUnitEstimates: unitItemsEstimate > 0,
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
