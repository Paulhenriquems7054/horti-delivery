import { describe, expect, it } from "vitest";
import { calculateCartEstimate, cartLineSubtotal, formatCurrency } from "./priceEstimation";
import type { BasketProduct } from "@/hooks/useActiveBasket";

const tomato: BasketProduct = {
  id: "t1",
  name: "Tomate",
  price: 8.5,
  image_url: null,
  unit: "un",
  quantity: 1,
  sell_by: "unit",
  price_per_unit: 8.5,
  price_per_kg: 8.5,
};

describe("cálculo da cesta", () => {
  it("TESTE 1: adicionar produto calcula subtotal", () => {
    const totals = calculateCartEstimate([tomato], { t1: 1 }, {}, {});
    expect(totals.unitItemsSubtotal).toBe(8.5);
    expect(totals.itemsSubtotal).toBe(8.5);
  });

  it("TESTE 2: quantidade 1 → 3 multiplica o preço", () => {
    expect(cartLineSubtotal(tomato, "unit", 3, 0)).toBe(25.5);
    const totals = calculateCartEstimate([tomato], { t1: 3 }, {}, {});
    expect(totals.unitItemsSubtotal).toBe(25.5);
  });

  it("TESTE 3: remover produto zera o total", () => {
    const totals = calculateCartEstimate([tomato], {}, {}, {});
    expect(totals.itemsSubtotal).toBe(0);
  });

  it("formata moeda em pt-BR", () => {
    expect(formatCurrency(25.5)).toBe("R$ 25,50");
  });
});
