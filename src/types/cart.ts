import type { BasketProduct } from "@/hooks/useActiveBasket";

export interface CartLineItem {
  lineId: string;
  productId: string;
  soldBy: "unit" | "weight";
  quantity: number;
  weightKg: number;
  itemNotes: string;
}

export interface ResolvedCartLine extends CartLineItem {
  product: BasketProduct;
  lineSubtotal: number;
}

export function newCartLine(
  productId: string,
  soldBy: "unit" | "weight",
  opts?: { quantity?: number; weightKg?: number }
): CartLineItem {
  return {
    lineId: crypto.randomUUID(),
    productId,
    soldBy,
    quantity: opts?.quantity ?? (soldBy === "unit" ? 1 : 0),
    weightKg: opts?.weightKg ?? 0,
    itemNotes: "",
  };
}

export function resolveCartLines(
  lines: CartLineItem[],
  products: BasketProduct[]
): ResolvedCartLine[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return lines
    .map((line) => {
      const product = byId.get(line.productId);
      if (!product) return null;
      const pricePerKg = product.price_per_kg ?? product.price;
      const pricePerUnit = product.price_per_unit ?? product.price;
      const lineSubtotal =
        line.soldBy === "weight"
          ? line.weightKg * pricePerKg
          : line.quantity * pricePerUnit;
      return { ...line, product, lineSubtotal };
    })
    .filter((x): x is ResolvedCartLine => x !== null && x.lineSubtotal > 0);
}
