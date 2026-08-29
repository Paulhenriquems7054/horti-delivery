import { describe, expect, it } from "vitest";
import {
  CATALOG_PAGE_SIZE,
  flattenCatalogPages,
  storeCatalogQueryKey,
  type StoreCatalogPage,
} from "./useStoreCatalogProducts";

describe("useStoreCatalogProducts helpers", () => {
  it("query key muda ao trocar categoria (reinicia paginação)", () => {
    const k1 = storeCatalogQueryKey("store-1", "cat-a", "");
    const k2 = storeCatalogQueryKey("store-1", "cat-b", "");
    expect(k1).not.toEqual(k2);
  });

  it("query key muda ao trocar busca", () => {
    const k1 = storeCatalogQueryKey("store-1", "cat-a", "arroz");
    const k2 = storeCatalogQueryKey("store-1", "cat-a", "");
    expect(k1).not.toEqual(k2);
  });

  it("flattenCatalogPages não duplica itens entre páginas", () => {
    const pages: StoreCatalogPage[] = [
      {
        page: 0,
        hasMore: true,
        totalCount: 3,
        products: [
          { id: "a", name: "A", price: 1, image_url: null, unit: "un", quantity: 1, sell_by: "unit" },
          { id: "b", name: "B", price: 2, image_url: null, unit: "un", quantity: 1, sell_by: "unit" },
        ],
      },
      {
        page: 1,
        hasMore: false,
        totalCount: 3,
        products: [
          { id: "b", name: "B dup", price: 2, image_url: null, unit: "un", quantity: 1, sell_by: "unit" },
          { id: "c", name: "C", price: 3, image_url: null, unit: "un", quantity: 1, sell_by: "unit" },
        ],
      },
    ];
    const flat = flattenCatalogPages(pages);
    expect(flat.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("primeira página não representa catálogo inteiro quando totalCount > page size", () => {
    const pages: StoreCatalogPage[] = [
      {
        page: 0,
        hasMore: true,
        totalCount: 5000,
        products: Array.from({ length: CATALOG_PAGE_SIZE }, (_, i) => ({
          id: `p-${i}`,
          name: `P ${i}`,
          price: 1,
          image_url: null,
          unit: "un",
          quantity: 1,
          sell_by: "unit" as const,
        })),
      },
    ];
    const flat = flattenCatalogPages(pages);
    expect(flat.length).toBe(CATALOG_PAGE_SIZE);
    expect(pages[0]!.totalCount).toBeGreaterThan(CATALOG_PAGE_SIZE);
  });
});
