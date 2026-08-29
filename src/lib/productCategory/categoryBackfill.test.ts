import { describe, expect, it } from "vitest";
import {
  analyzeSourceDbGap,
  buildProductIndexes,
  planCategoryBackfill,
  simulateBackfillRpcApply,
  type ClassificationSourceRecord,
  type DbProductRef,
} from "./categoryBackfill";

const STORE_A = "store-a";
const STORE_B = "store-b";
const CAT_HORTI = "cat-horti";
const CAT_BEBIDAS = "cat-bebidas";
const CAT_OTHER_STORE = "cat-other";

const categoryNameToId = new Map([
  ["Hortifrúti", CAT_HORTI],
  ["Bebidas", CAT_BEBIDAS],
]);

const categoryIdToName = new Map([
  [CAT_HORTI, "Hortifrúti"],
  [CAT_BEBIDAS, "Bebidas"],
]);

function classified(
  internalCode: string,
  categoryName: "Hortifrúti" | "Bebidas",
  barcode = "0",
): ClassificationSourceRecord {
  return {
    internalCode,
    barcode,
    name: `Produto ${internalCode}`,
    classificationStatus: "CLASSIFIED",
    categoryName,
  };
}

function dbProduct(
  id: string,
  internal_code: string,
  opts?: Partial<DbProductRef>,
): DbProductRef {
  return {
    id,
    internal_code,
    barcode: opts?.barcode ?? "0",
    category_id: opts?.category_id ?? null,
    active: opts?.active ?? true,
  };
}

describe("categoryBackfill", () => {
  it("match seguro por internal_code atualiza category_id NULL", () => {
    const source = [classified("100", "Hortifrúti")];
    const db = [dbProduct("p1", "100")];
    const plan = planCategoryBackfill(source, db, categoryNameToId, categoryIdToName);
    expect(plan.summary.SAFE_MATCH_INTERNAL_CODE).toBe(1);
    expect(plan.summary.WOULD_UPDATE).toBe(1);
    expect(plan.assignments[0]?.productId).toBe("p1");
  });

  it("match seguro por barcode significativo", () => {
    const source: ClassificationSourceRecord[] = [
      {
        internalCode: "999",
        barcode: "7891234567890",
        name: "Suco",
        classificationStatus: "CLASSIFIED",
        categoryName: "Bebidas",
      },
    ];
    const db = [dbProduct("p2", "888", { barcode: "7891234567890" })];
    const plan = planCategoryBackfill(source, db, categoryNameToId, categoryIdToName);
    expect(plan.summary.SAFE_MATCH_BARCODE).toBe(1);
    expect(plan.assignments[0]?.identityType).toBe("barcode");
  });

  it("barcode '0' não é usado como identidade", () => {
    const source = [classified("101", "Hortifrúti", "0")];
    const db = [dbProduct("p3", "200", { barcode: "0" })];
    const plan = planCategoryBackfill(source, db, categoryNameToId, categoryIdToName);
    expect(plan.summary.NOT_FOUND).toBe(1);
    expect(plan.summary.SAFE_MATCH_BARCODE).toBe(0);
  });

  it("'00' e '000' não são usados como identidade", () => {
    for (const bc of ["00", "000"]) {
      const source: ClassificationSourceRecord[] = [
        {
          internalCode: "x",
          barcode: bc,
          name: "X",
          classificationStatus: "CLASSIFIED",
          categoryName: "Hortifrúti",
        },
      ];
      const db = [dbProduct("p", "y", { barcode: bc })];
      const plan = planCategoryBackfill(source, db, categoryNameToId, categoryIdToName);
      expect(plan.summary.NOT_FOUND).toBe(1);
    }
  });

  it("match ambíguo não gera assignment", () => {
    const source = [classified("102", "Hortifrúti")];
    const db = [dbProduct("p4", "102"), dbProduct("p5", "102")];
    const plan = planCategoryBackfill(source, db, categoryNameToId, categoryIdToName);
    expect(plan.summary.AMBIGUOUS_MATCH).toBe(1);
    expect(plan.assignments).toHaveLength(0);
  });

  it("produto não encontrado não insere", () => {
    const source = [classified("404", "Hortifrúti")];
    const plan = planCategoryBackfill(source, [], categoryNameToId, categoryIdToName);
    expect(plan.summary.NOT_FOUND).toBe(1);
    expect(plan.assignments).toHaveLength(0);
  });

  it("categoria de outro tenant não é aplicada na simulação RPC", () => {
    const products = [dbProduct("p6", "300")];
    const categories = [{ id: CAT_OTHER_STORE, store_id: STORE_B, active: true }];
    expect(() =>
      simulateBackfillRpcApply(
        [{ internal_code: "300", category_id: CAT_OTHER_STORE }],
        products,
        categories,
        { storeId: STORE_A, authUid: "user-1", isOwner: true },
      ),
    ).not.toThrow();
    const result = simulateBackfillRpcApply(
      [{ internal_code: "300", category_id: CAT_OTHER_STORE }],
      products,
      categories,
      { storeId: STORE_A, authUid: "user-1", isOwner: true },
    );
    expect(result.updated).toBe(0);
    expect(result.products[0]?.category_id).toBeNull();
  });

  it("produto de outro tenant não é atualizado (não está no índice da loja)", () => {
    const products = [dbProduct("p7", "400")];
    const categories = [{ id: CAT_HORTI, store_id: STORE_A, active: true }];
    const result = simulateBackfillRpcApply(
      [{ internal_code: "999", category_id: CAT_HORTI }],
      products,
      categories,
      { storeId: STORE_A, authUid: "user-1", isOwner: true },
    );
    expect(result.updated).toBe(0);
  });

  it("category_id NULL + match seguro pode atualizar", () => {
    const products = [dbProduct("p8", "500")];
    const categories = [{ id: CAT_HORTI, store_id: STORE_A, active: true }];
    const result = simulateBackfillRpcApply(
      [{ internal_code: "500", category_id: CAT_HORTI }],
      products,
      categories,
      { storeId: STORE_A, authUid: "user-1", isOwner: true },
    );
    expect(result.updated).toBe(1);
    expect(result.products[0]?.category_id).toBe(CAT_HORTI);
  });

  it("categoria já correta não gera update", () => {
    const source = [classified("600", "Hortifrúti")];
    const db = [dbProduct("p9", "600", { category_id: CAT_HORTI })];
    const plan = planCategoryBackfill(source, db, categoryNameToId, categoryIdToName);
    expect(plan.summary.ALREADY_CORRECT).toBe(1);
    expect(plan.summary.WOULD_UPDATE).toBe(0);
  });

  it("categoria diferente gera conflito e não sobrescreve", () => {
    const source = [classified("700", "Bebidas")];
    const db = [dbProduct("p10", "700", { category_id: CAT_HORTI })];
    const plan = planCategoryBackfill(source, db, categoryNameToId, categoryIdToName);
    expect(plan.summary.ALREADY_DIFFERENT).toBe(1);
    expect(plan.assignments).toHaveLength(0);

    const categories = [
      { id: CAT_HORTI, store_id: STORE_A, active: true },
      { id: CAT_BEBIDAS, store_id: STORE_A, active: true },
    ];
    const rpc = simulateBackfillRpcApply(
      [{ internal_code: "700", category_id: CAT_BEBIDAS }],
      db,
      categories,
      { storeId: STORE_A, authUid: "user-1", isOwner: true },
    );
    expect(rpc.updated).toBe(0);
    expect(rpc.products[0]?.category_id).toBe(CAT_HORTI);
  });

  it("operação repetida é idempotente", () => {
    const products = [dbProduct("p11", "800")];
    const categories = [{ id: CAT_HORTI, store_id: STORE_A, active: true }];
    const ctx = { storeId: STORE_A, authUid: "user-1", isOwner: true };
    const first = simulateBackfillRpcApply(
      [{ internal_code: "800", category_id: CAT_HORTI }],
      products,
      categories,
      ctx,
    );
    const second = simulateBackfillRpcApply(
      [{ internal_code: "800", category_id: CAT_HORTI }],
      first.products,
      categories,
      ctx,
    );
    expect(first.updated).toBe(1);
    expect(second.updated).toBe(0);
  });

  it("UNCLASSIFIED não entra no backfill", () => {
    const source: ClassificationSourceRecord[] = [
      {
        internalCode: "900",
        barcode: "0",
        name: "X",
        classificationStatus: "UNCLASSIFIED",
        categoryName: null,
      },
    ];
    const db = [dbProduct("p12", "900")];
    const plan = planCategoryBackfill(source, db, categoryNameToId, categoryIdToName);
    expect(plan.summary.WOULD_SKIP).toBe(1);
    expect(plan.summary.SOURCE_UNCLASSIFIED_TOTAL).toBe(1);
  });

  it("caller não autenticado é rejeitado", () => {
    expect(() =>
      simulateBackfillRpcApply(
        [{ internal_code: "1", category_id: CAT_HORTI }],
        [],
        [],
        { storeId: STORE_A, authUid: null, isOwner: true },
      ),
    ).toThrow(/not authenticated/i);
  });

  it("usuário não owner é rejeitado", () => {
    expect(() =>
      simulateBackfillRpcApply(
        [{ internal_code: "1", category_id: CAT_HORTI }],
        [],
        [],
        { storeId: STORE_A, authUid: "user-1", isOwner: false },
      ),
    ).toThrow(/not authorized/i);
  });

  it("invariante de totais do plano", () => {
    const source = [
      classified("1", "Hortifrúti"),
      classified("2", "Bebidas"),
      {
        internalCode: "3",
        barcode: "0",
        name: "U",
        classificationStatus: "UNCLASSIFIED" as const,
        categoryName: null,
      },
    ];
    const db = [dbProduct("a", "1"), dbProduct("b", "2"), dbProduct("c", "3")];
    const plan = planCategoryBackfill(source, db, categoryNameToId, categoryIdToName);
    const s = plan.summary;
    expect(
      s.WOULD_UPDATE +
        s.ALREADY_CORRECT +
        s.ALREADY_DIFFERENT +
        s.AMBIGUOUS_MATCH +
        s.NOT_FOUND +
        s.CATEGORY_NOT_FOUND +
        s.WOULD_SKIP,
    ).toBe(s.TOTAL_ANALYZED);
  });

  it("buildProductIndexes detecta ambiguidade no banco", () => {
    const idx = buildProductIndexes([dbProduct("a", "dup"), dbProduct("b", "dup")]);
    expect(idx.byInternalCode.get("dup")).toHaveLength(2);
  });

  it("gap analysis separa códigos só na fonte vs só no banco", () => {
    const source = [classified("s1", "Hortifrúti"), classified("s2", "Hortifrúti")];
    const db = [dbProduct("d1", "s1"), dbProduct("d2", "db-only")];
    const gap = analyzeSourceDbGap(source, db);
    expect(gap.sourceOnlyInternalCodes).toEqual(["s2"]);
    expect(gap.dbOnlyInternalCodes).toEqual(["db-only"]);
  });
});

describe("backfill RPC contract", () => {
  it("retry não causa alteração indevida após primeira aplicação", () => {
    const categories = [{ id: CAT_HORTI, store_id: STORE_A, active: true }];
    const ctx = { storeId: STORE_A, authUid: "u", isOwner: true };
    let products = [dbProduct("x", "111")];
    const payload = [{ internal_code: "111", category_id: CAT_HORTI }];
    const r1 = simulateBackfillRpcApply(payload, products, categories, ctx);
    const r2 = simulateBackfillRpcApply(payload, r1.products, categories, ctx);
    expect(r1.updated).toBe(1);
    expect(r2.updated).toBe(0);
    expect(r2.products[0]?.category_id).toBe(CAT_HORTI);
  });
});
