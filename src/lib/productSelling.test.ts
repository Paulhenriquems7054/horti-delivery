import { describe, expect, it } from "vitest";
import type { BasketProduct } from "@/hooks/useActiveBasket";
import {
  isHortifrutiCategory,
  normalizeProductSelling,
  resolveSellBy,
} from "@/lib/productSelling";

function baseProduct(overrides: Partial<BasketProduct> = {}): BasketProduct {
  return {
    id: "p1",
    name: "Banana",
    price: 6,
    image_url: null,
    unit: "un",
    quantity: 1,
    sell_by: "unit",
    ...overrides,
  };
}

describe("resolveSellBy", () => {
  it("mantém both e weight do banco", () => {
    expect(resolveSellBy("both", "Mercearia Seca e Básica")).toBe("both");
    expect(resolveSellBy("weight", "Hortifrúti")).toBe("weight");
  });

  it("promove hortifrúti importado como unit para both", () => {
    expect(resolveSellBy("unit", "Hortifrúti")).toBe("both");
    expect(resolveSellBy("unit", "HORTIFRUTI")).toBe("both");
  });

  it("mantém unit em outras categorias", () => {
    expect(resolveSellBy("unit", "Higiene Pessoal")).toBe("unit");
    expect(resolveSellBy("unit", null)).toBe("unit");
  });
});

describe("normalizeProductSelling", () => {
  it("deriva price_per_kg a partir do preço unitário", () => {
    const normalized = normalizeProductSelling(
      baseProduct({
        price: 3,
        price_per_unit: 3,
        average_weight: 0.3,
      }),
      "Hortifrúti",
    );

    expect(normalized.sell_by).toBe("both");
    expect(normalized.price_per_unit).toBe(3);
    expect(normalized.price_per_kg).toBe(10);
  });

  it("não altera produto de mercearia", () => {
    const normalized = normalizeProductSelling(
      baseProduct({ price: 12.9, sell_by: "unit" }),
      "Higiene Pessoal",
    );

    expect(normalized.sell_by).toBe("unit");
    expect(normalized.price_per_kg).toBeUndefined();
  });
});

describe("isHortifrutiCategory", () => {
  it("reconhece variações de acento e caixa", () => {
    expect(isHortifrutiCategory("Hortifrúti")).toBe(true);
    expect(isHortifrutiCategory("HORTIFRUTI")).toBe(true);
  });
});
