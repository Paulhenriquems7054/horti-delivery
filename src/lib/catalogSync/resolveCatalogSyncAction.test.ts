import { describe, expect, it } from "vitest";
import { resolveCategoryIdAfterSync, applyPdvPatchPreservingHorti } from "./ownership";
import {
  buildExternalIndex,
  externalIdentityKey,
  findByName,
  resolveCatalogSyncAction,
  resolveIdempotentReplay,
  productsForStore,
} from "./resolveCatalogSyncAction";
import type { CatalogProductRef, ExternalIdentifierRow, ResolveCatalogSyncContext } from "./types";
import { isMeaningfulBarcode, normalizeBarcode } from "./barcode";

const STORE_A = "11111111-1111-1111-1111-111111111111";
const STORE_B = "22222222-2222-2222-2222-222222222222";

function product(
  id: string,
  storeId: string,
  overrides?: Partial<CatalogProductRef>,
): CatalogProductRef {
  return {
    id,
    storeId,
    internalCode: null,
    barcode: null,
    name: "Produto",
    categoryId: null,
    active: true,
    ...overrides,
  };
}

function ctx(
  storeId: string,
  provider: string,
  products: CatalogProductRef[],
  externalIdentifiers: ExternalIdentifierRow[] = [],
): ResolveCatalogSyncContext {
  return { storeId, provider, products, externalIdentifiers };
}

describe("catalogSync resolveCatalogSyncAction", () => {
  // 1–5 identidade externa
  it("1. mesmo provider + external_id + mesma loja → UPDATE", () => {
    const products = [product("p1", STORE_A, { internalCode: "100" })];
    const external: ExternalIdentifierRow[] = [
      { storeId: STORE_A, provider: "pdv_a", externalId: "123", productId: "p1" },
    ];
    const d = resolveCatalogSyncAction(
      { externalId: "123", name: "X", price: 1 },
      ctx(STORE_A, "pdv_a", products, external),
    );
    expect(d.action).toBe("UPDATE");
    expect(d.reasonCode).toBe("EXTERNAL_ID_MATCH");
    expect(d.productId).toBe("p1");
  });

  it("2. mesmo external_id em lojas diferentes → permitido (CREATE)", () => {
    const productsB = [product("pb", STORE_B)];
    const externalA = [
      { storeId: STORE_A, provider: "pdv_a", externalId: "123", productId: "pa" },
    ];
    const d = resolveCatalogSyncAction(
      { externalId: "123", name: "Novo B", price: 2 },
      ctx(STORE_B, "pdv_a", productsB, externalA),
    );
    expect(d.action).toBe("CREATE");
  });

  it("3. mesmo external_id com providers diferentes → permitido", () => {
    const products = [product("p1", STORE_A)];
    const external = [
      { storeId: STORE_A, provider: "pdv_a", externalId: "123", productId: "p1" },
    ];
    const d = resolveCatalogSyncAction(
      { externalId: "123", name: "Via B", price: 1 },
      ctx(STORE_A, "pdv_b", products, external),
    );
    expect(d.action).toBe("CREATE");
  });

  it("4. conflito de internal_code duplicado na loja → CONFLICT", () => {
    const products = [
      product("a", STORE_A, { internalCode: "DUP" }),
      product("b", STORE_A, { internalCode: "DUP" }),
    ];
    const d = resolveCatalogSyncAction(
      { externalId: "new", internalCode: "DUP", name: "X", price: 1 },
      ctx(STORE_A, "pdv_a", products),
    );
    expect(d.action).toBe("CONFLICT");
    expect(d.reasonCode).toBe("DUPLICATE_INTERNAL_CODE");
  });

  it("5. produto pode ter identificadores de dois providers", () => {
    const external: ExternalIdentifierRow[] = [
      { storeId: STORE_A, provider: "pdv_a", externalId: "1001", productId: "p456" },
      { storeId: STORE_A, provider: "pdv_b", externalId: "ABC-99", productId: "p456" },
    ];
    expect(buildExternalIndex(external).size).toBe(2);
    const k1 = externalIdentityKey(STORE_A, "pdv_a", "1001");
    const k2 = externalIdentityKey(STORE_A, "pdv_b", "ABC-99");
    expect(buildExternalIndex(external).get(k1)).toBe("p456");
    expect(buildExternalIndex(external).get(k2)).toBe("p456");
  });

  // 6–8 internal code
  it("6. internal_code encontra produto da mesma loja", () => {
    const products = [product("p9", STORE_A, { internalCode: "500" })];
    const d = resolveCatalogSyncAction(
      { externalId: "ext-new", internalCode: "500", name: "X", price: 1 },
      ctx(STORE_A, "pdv_a", products),
    );
    expect(d.action).toBe("UPDATE");
    expect(d.reasonCode).toBe("INTERNAL_CODE_MATCH");
    expect(d.productId).toBe("p9");
  });

  it("7. código igual em outra loja não encontra produto local", () => {
    const products = [
      product("pa", STORE_A, { internalCode: "777" }),
      product("pb", STORE_B, { internalCode: "777" }),
    ];
    const d = resolveCatalogSyncAction(
      { externalId: "x", internalCode: "777", name: "X", price: 1 },
      ctx(STORE_A, "pdv_a", productsForStore(products, STORE_A)),
    );
    expect(d.productId).toBe("pa");
    expect(d.productId).not.toBe("pb");
  });

  it("8. conflito de identidade gera CONFLICT", () => {
    const products = [
      product("a", STORE_A, { barcode: "7891025121626" }),
      product("b", STORE_A, { barcode: "7891025121626" }),
    ];
    const d = resolveCatalogSyncAction(
      { externalId: "x", barcode: "7891025121626", name: "X", price: 1 },
      ctx(STORE_A, "pdv_a", products),
    );
    expect(d.action).toBe("CONFLICT");
    expect(d.reasonCode).toBe("IDENTITY_CONFLICT");
  });

  // 9–14 barcode
  it("9. EAN real identifica produto", () => {
    const products = [product("p1", STORE_A, { barcode: "7891025121626" })];
    const d = resolveCatalogSyncAction(
      { externalId: "x", barcode: "7891025121626", name: "X", price: 1 },
      ctx(STORE_A, "pdv_a", products),
    );
    expect(d.reasonCode).toBe("BARCODE_MATCH");
  });

  it.each(["0", "00", "000", "", null] as const)("10-14. barcode %s não identifica", (bc) => {
    const products = [product("p1", STORE_A, { barcode: bc === null ? "0" : "7891025121626" })];
    const d = resolveCatalogSyncAction(
      { externalId: "new-ext", barcode: bc, name: "Novo", price: 1 },
      ctx(STORE_A, "pdv_a", products),
    );
    expect(d.action).toBe("CREATE");
    expect(normalizeBarcode(bc)).toBeNull();
    expect(isMeaningfulBarcode(bc ?? "")).toBe(false);
  });

  // 15–16 nome
  it("15. nome igual não gera UPDATE automático", () => {
    const products = [product("p1", STORE_A, { name: "LEITE INTEGRAL 1L" })];
    const d = resolveCatalogSyncAction(
      { externalId: "brand-new", name: "LEITE INTEGRAL 1L", price: 5 },
      ctx(STORE_A, "pdv_a", products),
    );
    expect(d.action).toBe("CREATE");
    expect(findByName(products, "LEITE INTEGRAL 1L")).toBe("p1");
  });

  it("16. nome parecido não gera UPDATE automático", () => {
    const products = [product("p1", STORE_A, { name: "LEITE INTEGRAL 1L" })];
    const d = resolveCatalogSyncAction(
      { externalId: "x", name: "LEITE INTEGRAL CAIXA 1 L", price: 5 },
      ctx(STORE_A, "pdv_a", products),
    );
    expect(d.action).toBe("CREATE");
    expect(findByName(products, "LEITE INTEGRAL CAIXA 1 L")).toBeNull();
  });

  // 17–19 categoria
  it("17. UPDATE preserva category_id quando externo sem categoria", () => {
    const existing = {
      name: "A",
      price: 1,
      active: true,
      internalCode: "1",
      barcode: null,
      categoryId: "cat-leite",
    };
    const merged = applyPdvPatchPreservingHorti(existing, { name: "A2", price: 2 });
    expect(merged.categoryId).toBe("cat-leite");
  });

  it("18. categoria externa inválida não apaga category_id", () => {
    expect(resolveCategoryIdAfterSync("cat-x", false, true, null)).toBe("cat-x");
  });

  it("19. produto novo sem categoria → NULL", () => {
    expect(resolveCategoryIdAfterSync(null, true, false, null)).toBeNull();
  });

  // 20–22 idempotência
  it("20-22. retry com external_id já indexado → UPDATE, não CREATE", () => {
    const products = [product("p1", STORE_A)];
    const base = ctx(STORE_A, "pdv_a", products);
    const first = resolveCatalogSyncAction(
      { externalId: "e1", name: "N", price: 1 },
      base,
    );
    expect(first.action).toBe("CREATE");

    const secondCtx = ctx(STORE_A, "pdv_a", products, [
      { storeId: STORE_A, provider: "pdv_a", externalId: "e1", productId: "p1" },
    ]);
    const second = resolveCatalogSyncAction(
      { externalId: "e1", name: "N", price: 1 },
      secondCtx,
    );
    expect(second.action).toBe("UPDATE");
    expect(resolveIdempotentReplay(first, second)).toBe(true);
  });

  // 23–24 multi-tenant
  it("23. identidade indexada de outra loja rejeitada se produto não pertence ao tenant", () => {
    const products = [product("p-b", STORE_B)];
    const wrongIndex = [
      { storeId: STORE_A, provider: "pdv_a", externalId: "1", productId: "p-a-other" },
    ];
    const d = resolveCatalogSyncAction(
      { externalId: "999", internalCode: "x", name: "N", price: 1 },
      ctx(STORE_B, "pdv_a", products, wrongIndex),
    );
    expect(d.action).not.toBe("UPDATE");
    expect(d.productId).not.toBe("p-a-other");
  });

  it("24. external_id match só dentro do storeId do contexto", () => {
    const products = [product("p-b", STORE_B)];
    const index = [
      { storeId: STORE_A, provider: "pdv_a", externalId: "shared", productId: "p-a" },
    ];
    const d = resolveCatalogSyncAction(
      { externalId: "shared", name: "N", price: 1 },
      ctx(STORE_B, "pdv_a", products, index),
    );
    expect(d.action).toBe("CREATE");
    expect(d.productId).not.toBe("p-a");
  });
});

describe("catalogSync invalid price", () => {
  it("preço inválido → SKIP", () => {
    const d = resolveCatalogSyncAction(
      { externalId: "1", name: "X", price: -1 },
      ctx(STORE_A, "pdv_a", []),
    );
    expect(d.action).toBe("SKIP");
    expect(d.reasonCode).toBe("INVALID_PRICE");
  });
});
