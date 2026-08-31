import { describe, expect, it } from "vitest";
import {
  assertNoDuplicateProductIds,
  chunkBackfillAssignments,
} from "./backfillBatches";
import {
  planCategoryBackfill,
  type BackfillAssignment,
  type ClassificationSourceRecord,
  type DbProductRef,
} from "./categoryBackfill";

const CAT_HORTI = "cat-horti";
const CAT_BEBIDAS = "cat-bebidas";

const categoryNameToId = new Map([
  ["Hortifrúti", CAT_HORTI],
  ["Bebidas", CAT_BEBIDAS],
]);
const categoryIdToName = new Map([
  [CAT_HORTI, "Hortifrúti"],
  [CAT_BEBIDAS, "Bebidas"],
]);

function classified(
  code: string,
  categoryName: "Hortifrúti" | "Bebidas",
  barcode = "0",
): ClassificationSourceRecord {
  return {
    internalCode: code,
    barcode,
    name: `P ${code}`,
    classificationStatus: "CLASSIFIED",
    categoryName,
  };
}

function db(id: string, code: string, opts?: Partial<DbProductRef>): DbProductRef {
  return {
    id,
    internal_code: code,
    barcode: opts?.barcode ?? "0",
    category_id: opts?.category_id ?? null,
    active: opts?.active ?? true,
  };
}

describe("backfillBatches", () => {
  it("particiona em lotes de tamanho fixo", () => {
    const assignments: BackfillAssignment[] = Array.from({ length: 750 }, (_, i) => ({
      productId: `p${i}`,
      categoryId: CAT_HORTI,
      identityType: "internal_code",
      identityValue: String(i),
      categoryName: "Hortifrúti",
    }));
    const chunks = chunkBackfillAssignments(assignments, 300);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(300);
    expect(chunks[1]).toHaveLength(300);
    expect(chunks[2]).toHaveLength(150);
  });

  it("detecta productId duplicado no plano", () => {
    const ok = assertNoDuplicateProductIds([
      {
        productId: "a",
        categoryId: CAT_HORTI,
        identityType: "internal_code",
        identityValue: "1",
        categoryName: "Hortifrúti",
      },
      {
        productId: "a",
        categoryId: CAT_HORTI,
        identityType: "internal_code",
        identityValue: "1",
        categoryName: "Hortifrúti",
      },
    ]);
    expect(ok).toBe(false);
  });
});

describe("classified integrity equation", () => {
  it("todos CLASSIFIED entram em exatamente um resultado auditável", () => {
    const source: ClassificationSourceRecord[] = [
      classified("1", "Hortifrúti"),
      classified("2", "Bebidas"),
      classified("3", "Hortifrúti"),
      classified("4", "Hortifrúti"),
      classified("5", "Hortifrúti"),
      {
        internalCode: "u",
        barcode: "0",
        name: "U",
        classificationStatus: "UNCLASSIFIED",
        categoryName: null,
      },
    ];
    const products = [
      db("p1", "1"),
      db("p2", "2", { category_id: CAT_BEBIDAS }),
      db("p3", "3", { category_id: CAT_HORTI }), // already correct wrong? wait - classified as Hortifruti with CAT_HORTI = correct
      db("p4", "4", { category_id: CAT_BEBIDAS }), // different
      // 5 not found
    ];
    // fix p3: already correct Hortifruti
    products[2] = db("p3", "3", { category_id: CAT_HORTI });

    const plan = planCategoryBackfill(source, products, categoryNameToId, categoryIdToName);
    const classifiedResults = plan.results.filter(
      (r) => r.source.classificationStatus === "CLASSIFIED",
    );
    expect(classifiedResults).toHaveLength(5);

    const sum =
      plan.summary.WOULD_UPDATE +
      plan.summary.ALREADY_CORRECT +
      plan.summary.ALREADY_DIFFERENT +
      plan.summary.NOT_FOUND +
      plan.summary.AMBIGUOUS_MATCH +
      plan.summary.CATEGORY_NOT_FOUND;
    expect(sum).toBe(plan.summary.SOURCE_CLASSIFIED_TOTAL);
    expect(assertNoDuplicateProductIds(plan.assignments)).toBe(true);
  });

  it("UNCLASSIFIED nunca gera assignment", () => {
    const source: ClassificationSourceRecord[] = [
      {
        internalCode: "9",
        barcode: "0",
        name: "X",
        classificationStatus: "UNCLASSIFIED",
        categoryName: null,
      },
    ];
    const plan = planCategoryBackfill(
      source,
      [db("p", "9")],
      categoryNameToId,
      categoryIdToName,
    );
    expect(plan.assignments).toHaveLength(0);
  });

  it("assignment inválido (categoria ausente) não é WOULD_UPDATE", () => {
    const source = [classified("10", "Hortifrúti")];
    const plan = planCategoryBackfill(source, [db("p", "10")], new Map(), new Map());
    expect(plan.summary.WOULD_UPDATE).toBe(0);
    expect(plan.summary.CATEGORY_NOT_FOUND).toBe(1);
  });
});
