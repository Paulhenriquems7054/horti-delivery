import { describe, expect, it } from "vitest";
import {
  buildExternalIdIndex,
  externalIdKey,
  isDuplicateInternalCodeConflict,
  resolveProductIdentity,
} from "./identity";

const STORE_A = "store-a";
const STORE_B = "store-b";

describe("catalogIntegration identity", () => {
  const products = [
    { id: "p1", internalCode: "100", barcode: "7891025121626" },
    { id: "p2", internalCode: "200", barcode: "0" },
    { id: "p3", internalCode: "300", barcode: "00" },
  ];

  const externalIndex = buildExternalIdIndex([
    { provider: "pdv_a", externalId: "ext-1", productId: "p1" },
  ]);

  it("mesmo external_id → mesmo produto", () => {
    const r = resolveProductIdentity(
      products,
      { provider: "pdv_a", externalId: "ext-1", internalCode: "999" },
      externalIndex,
    );
    expect(r.productId).toBe("p1");
    expect(r.matchedBy).toBe("external_id");
  });

  it("external_id desconhecido com internal_code único → match por código", () => {
    const r = resolveProductIdentity(
      products,
      { provider: "pdv_a", externalId: "new-ext", internalCode: "200" },
      externalIndex,
    );
    expect(r.productId).toBe("p2");
    expect(r.matchedBy).toBe("internal_code");
  });

  it("external_id desconhecido sem match → null (novo produto)", () => {
    const r = resolveProductIdentity(
      products,
      { provider: "pdv_a", externalId: "brand-new", internalCode: "9999" },
      externalIndex,
    );
    expect(r.productId).toBeNull();
  });

  it("código interno duplicado → conflito (null)", () => {
    const dupProducts = [
      { id: "a", internalCode: "DUP", barcode: null },
      { id: "b", internalCode: "DUP", barcode: null },
    ];
    expect(isDuplicateInternalCodeConflict(dupProducts, "DUP")).toBe(true);
    const r = resolveProductIdentity(
      dupProducts,
      { provider: "pdv_a", externalId: "x", internalCode: "DUP" },
      new Map(),
    );
    expect(r.productId).toBeNull();
  });

  it("barcode 0 / 00 / 000 não usados como identidade", () => {
    for (const bc of ["0", "00", "000"]) {
      const r = resolveProductIdentity(
        products,
        { provider: "pdv_a", externalId: "x", barcode: bc },
        new Map(),
      );
      expect(r.productId).toBeNull();
      expect(r.matchedBy).toBeNull();
    }
  });

  it("barcode significativo resolve produto", () => {
    const r = resolveProductIdentity(
      products,
      { provider: "pdv_a", externalId: "x", barcode: "7891025121626" },
      new Map(),
    );
    expect(r.productId).toBe("p1");
    expect(r.matchedBy).toBe("barcode");
  });

  it("identificador externo é escopado por loja no key helper", () => {
    expect(externalIdKey(STORE_A, "pdv", "1")).not.toBe(externalIdKey(STORE_B, "pdv", "1"));
  });
});

describe("multi-tenant isolation (conceptual)", () => {
  it("cada loja usa apenas seu índice externo", () => {
    const storeAIndex = buildExternalIdIndex([
      { provider: "pdv", externalId: "1", productId: "prod-store-a" },
    ]);
    const storeBProducts = [{ id: "prod-store-b", internalCode: "999", barcode: null }];
    const storeBIndex = new Map<string, string>();

    const wrong = resolveProductIdentity(
      storeBProducts,
      { provider: "pdv", externalId: "1", internalCode: "999" },
      storeAIndex,
    );
    expect(wrong.productId).toBe("prod-store-a");
    expect(wrong.matchedBy).toBe("external_id");

    const correct = resolveProductIdentity(
      storeBProducts,
      { provider: "pdv", externalId: "1", internalCode: "999" },
      storeBIndex,
    );
    expect(correct.productId).toBe("prod-store-b");
    expect(correct.matchedBy).toBe("internal_code");
  });
});
