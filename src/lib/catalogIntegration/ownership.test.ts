import { describe, expect, it } from "vitest";
import { mergePdvIntoExisting, resolveCategoryAfterSync } from "./ownership";

describe("catalogIntegration ownership", () => {
  const existing = {
    name: "LEITE INTEGRAL 1L",
    price: 5.99,
    active: true,
    internalCode: "100",
    barcode: "789000",
    categoryId: "cat-leite",
    imageUrl: "https://img/1.jpg",
    description: "Promo",
  };

  it("sincronização sem categoria preserva category_id", () => {
    const merged = mergePdvIntoExisting(existing, {
      name: "LEITE INTEGRAL CAIXA 1 L",
      price: 6.49,
    });
    expect(merged.categoryId).toBe("cat-leite");
    expect(merged.name).toBe("LEITE INTEGRAL CAIXA 1 L");
    expect(merged.price).toBe(6.49);
  });

  it("categoria externa inválida não apaga categoria existente", () => {
    const cat = resolveCategoryAfterSync("cat-leite", undefined, true);
    expect(cat).toBe("cat-leite");
  });

  it("produto novo sem categoria permanece null", () => {
    const cat = resolveCategoryAfterSync(null, undefined, false);
    expect(cat).toBeNull();
  });

  it("PDV atualiza campos permitidos sem tocar foto/descrição", () => {
    const merged = mergePdvIntoExisting(existing, { price: 7.0, active: false });
    expect(merged.imageUrl).toBe("https://img/1.jpg");
    expect(merged.description).toBe("Promo");
    expect(merged.active).toBe(false);
  });
});
