/**
 * Planejamento determinístico de backfill de category_id — multi-tenant safe.
 * Matching principal: internal_code, fallback: barcode significativo.
 * Nunca usa nome como chave de escrita.
 */

import { isMeaningfulBarcode } from "@/lib/productImport/dedupe";
import type { CatalogCategoryName } from "./classifyProduct";

export type BackfillOutcome =
  | "SAFE_MATCH_INTERNAL_CODE"
  | "SAFE_MATCH_BARCODE"
  | "AMBIGUOUS_MATCH"
  | "NOT_FOUND"
  | "CATEGORY_NOT_FOUND"
  | "ALREADY_CORRECT"
  | "ALREADY_DIFFERENT"
  | "WOULD_SKIP_UNCLASSIFIED"
  | "WOULD_SKIP_NOT_CLASSIFIED"
  | "WOULD_SKIP_IMPORT_BLOCKED";

export interface ClassificationSourceRecord {
  internalCode: string;
  barcode: string;
  name: string;
  classificationStatus: "CLASSIFIED" | "UNCLASSIFIED" | "REVIEW_REQUIRED";
  categoryName: CatalogCategoryName | null;
  sourceRow?: number;
  importBlocked?: boolean;
  spreadsheetStatus?: string;
}

export interface DbProductRef {
  id: string;
  internal_code: string | null;
  barcode: string | null;
  category_id: string | null;
  active: boolean;
}

export interface BackfillAssignment {
  productId: string;
  categoryId: string;
  identityType: "internal_code" | "barcode";
  identityValue: string;
  categoryName: string;
}

export interface BackfillRecordResult {
  source: ClassificationSourceRecord;
  outcome: BackfillOutcome;
  matchedProductId?: string;
  currentCategoryId?: string | null;
  proposedCategoryId?: string;
  assignment?: BackfillAssignment;
}

export interface BackfillSummary {
  SOURCE_CLASSIFIED_TOTAL: number;
  SOURCE_UNCLASSIFIED_TOTAL: number;
  SOURCE_REVIEW_REQUIRED_TOTAL: number;
  SOURCE_IMPORT_BLOCKED_TOTAL: number;
  SAFE_MATCH_INTERNAL_CODE: number;
  SAFE_MATCH_BARCODE: number;
  ALREADY_CORRECT: number;
  CATEGORY_ID_NULL_AND_UPDATABLE: number;
  ALREADY_DIFFERENT: number;
  AMBIGUOUS_MATCH: number;
  NOT_FOUND: number;
  CATEGORY_NOT_FOUND: number;
  WOULD_UPDATE: number;
  WOULD_SKIP: number;
  WOULD_BLOCK: number;
  TOTAL_ANALYZED: number;
}

export interface SourceDbGapAnalysis {
  sourceImportableTotal: number;
  dbActiveTotal: number;
  delta: number;
  sourceOnlyInternalCodes: string[];
  dbOnlyInternalCodes: string[];
  dbInactiveCount: number;
  sourceImportBlockedCount: number;
  ambiguousInternalCodeInDb: string[];
  ambiguousBarcodeInDb: string[];
}

export interface BackfillPlan {
  results: BackfillRecordResult[];
  summary: BackfillSummary;
  assignments: BackfillAssignment[];
  currentDistribution: Map<string | null, number>;
  projectedDistribution: Map<string | null, number>;
  gapAnalysis: SourceDbGapAnalysis;
}

export interface ProductIndexes {
  byInternalCode: Map<string, DbProductRef[]>;
  byBarcode: Map<string, DbProductRef[]>;
  activeProducts: DbProductRef[];
}

export function buildProductIndexes(products: DbProductRef[]): ProductIndexes {
  const activeProducts = products.filter((p) => p.active);
  const byInternalCode = new Map<string, DbProductRef[]>();
  const byBarcode = new Map<string, DbProductRef[]>();

  for (const p of activeProducts) {
    const code = p.internal_code?.trim();
    if (code) {
      const list = byInternalCode.get(code) ?? [];
      list.push(p);
      byInternalCode.set(code, list);
    }
    const bc = p.barcode?.trim();
    if (bc && isMeaningfulBarcode(bc)) {
      const list = byBarcode.get(bc) ?? [];
      list.push(p);
      byBarcode.set(bc, list);
    }
  }

  return { byInternalCode, byBarcode, activeProducts };
}

type MatchResult =
  | { kind: "unique"; product: DbProductRef; identityType: "internal_code" | "barcode"; identityValue: string }
  | { kind: "ambiguous"; identityType: "internal_code" | "barcode"; identityValue: string }
  | { kind: "not_found" };

function resolveUniqueMatch(
  source: ClassificationSourceRecord,
  indexes: ProductIndexes,
): MatchResult {
  const code = source.internalCode.trim();
  if (code) {
    const matches = indexes.byInternalCode.get(code) ?? [];
    if (matches.length > 1) {
      return { kind: "ambiguous", identityType: "internal_code", identityValue: code };
    }
    if (matches.length === 1) {
      return {
        kind: "unique",
        product: matches[0]!,
        identityType: "internal_code",
        identityValue: code,
      };
    }
  }

  const bc = source.barcode.trim();
  if (isMeaningfulBarcode(bc)) {
    const matches = indexes.byBarcode.get(bc) ?? [];
    if (matches.length > 1) {
      return { kind: "ambiguous", identityType: "barcode", identityValue: bc };
    }
    if (matches.length === 1) {
      return {
        kind: "unique",
        product: matches[0]!,
        identityType: "barcode",
        identityValue: bc,
      };
    }
  }

  return { kind: "not_found" };
}

function countDistribution(
  products: DbProductRef[],
  categoryIdToName: Map<string, string>,
): Map<string | null, number> {
  const dist = new Map<string | null, number>();
  for (const p of products.filter((x) => x.active)) {
    const key = p.category_id
      ? (categoryIdToName.get(p.category_id) ?? p.category_id)
      : null;
    dist.set(key, (dist.get(key) ?? 0) + 1);
  }
  return dist;
}

export function analyzeSourceDbGap(
  sourceImportable: ClassificationSourceRecord[],
  dbProducts: DbProductRef[],
): SourceDbGapAnalysis {
  const sourceCodes = new Set(
    sourceImportable.filter((s) => !s.importBlocked).map((s) => s.internalCode.trim()),
  );
  const dbActiveCodes = new Set(
    dbProducts.filter((p) => p.active && p.internal_code?.trim()).map((p) => p.internal_code!.trim()),
  );
  const dbInactiveCount = dbProducts.filter((p) => !p.active).length;

  const sourceOnlyInternalCodes = [...sourceCodes].filter((c) => !dbActiveCodes.has(c)).sort();
  const dbOnlyInternalCodes = [...dbActiveCodes].filter((c) => !sourceCodes.has(c)).sort();

  const indexes = buildProductIndexes(dbProducts);
  const ambiguousInternalCodeInDb = [...indexes.byInternalCode.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([k]) => k);
  const ambiguousBarcodeInDb = [...indexes.byBarcode.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([k]) => k);

  return {
    sourceImportableTotal: sourceImportable.filter((s) => !s.importBlocked).length,
    dbActiveTotal: dbProducts.filter((p) => p.active).length,
    delta:
      sourceImportable.filter((s) => !s.importBlocked).length -
      dbProducts.filter((p) => p.active).length,
    sourceOnlyInternalCodes,
    dbOnlyInternalCodes,
    dbInactiveCount,
    sourceImportBlockedCount: sourceImportable.filter((s) => s.importBlocked).length,
    ambiguousInternalCodeInDb,
    ambiguousBarcodeInDb,
  };
}

export function planCategoryBackfill(
  source: ClassificationSourceRecord[],
  dbProducts: DbProductRef[],
  categoryNameToId: Map<string, string>,
  categoryIdToName: Map<string, string>,
): BackfillPlan {
  const indexes = buildProductIndexes(dbProducts);
  const results: BackfillRecordResult[] = [];
  const assignments: BackfillAssignment[] = [];

  let SOURCE_CLASSIFIED_TOTAL = 0;
  let SOURCE_UNCLASSIFIED_TOTAL = 0;
  let SOURCE_REVIEW_REQUIRED_TOTAL = 0;
  let SOURCE_IMPORT_BLOCKED_TOTAL = 0;

  for (const rec of source) {
    if (rec.importBlocked) {
      SOURCE_IMPORT_BLOCKED_TOTAL += 1;
      results.push({ source: rec, outcome: "WOULD_SKIP_IMPORT_BLOCKED" });
      continue;
    }

    if (rec.classificationStatus === "UNCLASSIFIED") {
      SOURCE_UNCLASSIFIED_TOTAL += 1;
      results.push({ source: rec, outcome: "WOULD_SKIP_UNCLASSIFIED" });
      continue;
    }

    if (rec.classificationStatus === "REVIEW_REQUIRED") {
      SOURCE_REVIEW_REQUIRED_TOTAL += 1;
      results.push({ source: rec, outcome: "WOULD_SKIP_NOT_CLASSIFIED" });
      continue;
    }

    SOURCE_CLASSIFIED_TOTAL += 1;

    if (!rec.categoryName) {
      results.push({ source: rec, outcome: "WOULD_SKIP_NOT_CLASSIFIED" });
      continue;
    }

    const proposedCategoryId = categoryNameToId.get(rec.categoryName);
    if (!proposedCategoryId) {
      results.push({
        source: rec,
        outcome: "CATEGORY_NOT_FOUND",
        proposedCategoryId: undefined,
      });
      continue;
    }

    const match = resolveUniqueMatch(rec, indexes);
    if (match.kind === "ambiguous") {
      results.push({ source: rec, outcome: "AMBIGUOUS_MATCH" });
      continue;
    }
    if (match.kind === "not_found") {
      results.push({ source: rec, outcome: "NOT_FOUND" });
      continue;
    }

    const product = match.product;
    const currentCategoryId = product.category_id;

    if (currentCategoryId === proposedCategoryId) {
      results.push({
        source: rec,
        outcome: "ALREADY_CORRECT",
        matchedProductId: product.id,
        currentCategoryId,
        proposedCategoryId,
      });
      continue;
    }

    if (currentCategoryId != null && currentCategoryId !== proposedCategoryId) {
      results.push({
        source: rec,
        outcome: "ALREADY_DIFFERENT",
        matchedProductId: product.id,
        currentCategoryId,
        proposedCategoryId,
      });
      continue;
    }

    const safeOutcome: BackfillOutcome =
      match.identityType === "internal_code"
        ? "SAFE_MATCH_INTERNAL_CODE"
        : "SAFE_MATCH_BARCODE";

    const assignment: BackfillAssignment = {
      productId: product.id,
      categoryId: proposedCategoryId,
      identityType: match.identityType,
      identityValue: match.identityValue,
      categoryName: rec.categoryName,
    };

    assignments.push(assignment);
    results.push({
      source: rec,
      outcome: safeOutcome,
      matchedProductId: product.id,
      currentCategoryId,
      proposedCategoryId,
      assignment,
    });
  }

  const countOutcome = (o: BackfillOutcome) => results.filter((r) => r.outcome === o).length;

  const SAFE_MATCH_INTERNAL_CODE = countOutcome("SAFE_MATCH_INTERNAL_CODE");
  const SAFE_MATCH_BARCODE = countOutcome("SAFE_MATCH_BARCODE");
  const WOULD_UPDATE = SAFE_MATCH_INTERNAL_CODE + SAFE_MATCH_BARCODE;

  const summary: BackfillSummary = {
    SOURCE_CLASSIFIED_TOTAL,
    SOURCE_UNCLASSIFIED_TOTAL,
    SOURCE_REVIEW_REQUIRED_TOTAL,
    SOURCE_IMPORT_BLOCKED_TOTAL,
    SAFE_MATCH_INTERNAL_CODE,
    SAFE_MATCH_BARCODE,
    ALREADY_CORRECT: countOutcome("ALREADY_CORRECT"),
    CATEGORY_ID_NULL_AND_UPDATABLE: WOULD_UPDATE,
    ALREADY_DIFFERENT: countOutcome("ALREADY_DIFFERENT"),
    AMBIGUOUS_MATCH: countOutcome("AMBIGUOUS_MATCH"),
    NOT_FOUND: countOutcome("NOT_FOUND"),
    CATEGORY_NOT_FOUND: countOutcome("CATEGORY_NOT_FOUND"),
    WOULD_UPDATE,
    WOULD_SKIP:
      countOutcome("WOULD_SKIP_UNCLASSIFIED") +
      countOutcome("WOULD_SKIP_NOT_CLASSIFIED") +
      countOutcome("WOULD_SKIP_IMPORT_BLOCKED") +
      countOutcome("ALREADY_CORRECT"),
    WOULD_BLOCK:
      countOutcome("ALREADY_DIFFERENT") +
      countOutcome("AMBIGUOUS_MATCH") +
      countOutcome("CATEGORY_NOT_FOUND"),
    TOTAL_ANALYZED: results.length,
  };

  const currentDistribution = countDistribution(dbProducts, categoryIdToName);
  const projectedProducts = dbProducts.map((p) => ({ ...p }));
  const assignmentByProductId = new Map(assignments.map((a) => [a.productId, a]));
  for (const p of projectedProducts) {
    const a = assignmentByProductId.get(p.id);
    if (a && p.category_id == null) {
      p.category_id = a.categoryId;
    }
  }
  const projectedDistribution = countDistribution(projectedProducts, categoryIdToName);

  const gapAnalysis = analyzeSourceDbGap(
    source.filter((s) => !s.importBlocked),
    dbProducts,
  );

  return {
    results,
    summary,
    assignments,
    currentDistribution,
    projectedDistribution,
    gapAnalysis,
  };
}

/** Payload RPC — não inclui store_id (derivado server-side). */
export function buildBackfillRpcPayload(
  assignments: BackfillAssignment[],
): RpcBackfillAssignment[] {
  return assignments.map((a) =>
    a.identityType === "internal_code"
      ? { internal_code: a.identityValue, category_id: a.categoryId }
      : { barcode: a.identityValue, category_id: a.categoryId },
  );
}

export interface RpcBackfillAssignment {
  internal_code?: string;
  barcode?: string;
  category_id: string;
}

export interface RpcBackfillContext {
  storeId: string;
  authUid: string | null;
  isOwner: boolean;
}

export interface RpcBackfillResult {
  updated: number;
  skipped: number;
  store_id: string;
  products: DbProductRef[];
}

/**
 * Simulação local do contrato da RPC backfill_product_categories_batch.
 */
export function simulateBackfillRpcApply(
  assignments: RpcBackfillAssignment[],
  products: DbProductRef[],
  categories: Array<{ id: string; store_id: string; active: boolean }>,
  context: RpcBackfillContext,
): RpcBackfillResult {
  if (!context.authUid) {
    throw new Error("not authenticated");
  }
  if (!context.isOwner) {
    throw new Error("not authorized");
  }

  const storeProducts = products.filter((p) => p.active);
  const indexes = buildProductIndexes(storeProducts);
  let updated = 0;
  let skipped = 0;
  const nextProducts = products.map((p) => ({ ...p }));

  for (const item of assignments) {
    const categoryId = item.category_id;
    const cat = categories.find((c) => c.id === categoryId && c.store_id === context.storeId && c.active);
    if (!cat) {
      skipped += 1;
      continue;
    }

    let match: DbProductRef | undefined;
    const code = item.internal_code?.trim();
    if (code) {
      const matches = indexes.byInternalCode.get(code) ?? [];
      if (matches.length !== 1) {
        skipped += 1;
        continue;
      }
      match = matches[0];
    } else {
      const bc = item.barcode?.trim();
      if (!bc || !isMeaningfulBarcode(bc)) {
        skipped += 1;
        continue;
      }
      const matches = indexes.byBarcode.get(bc) ?? [];
      if (matches.length !== 1) {
        skipped += 1;
        continue;
      }
      match = matches[0];
    }

    if (!match) {
      skipped += 1;
      continue;
    }

    const idx = nextProducts.findIndex((p) => p.id === match!.id);
    if (idx < 0) {
      skipped += 1;
      continue;
    }

    const current = nextProducts[idx]!;
    if (current.category_id != null) {
      skipped += 1;
      continue;
    }

    nextProducts[idx] = { ...current, category_id: categoryId };
    updated += 1;
  }

  return {
    updated,
    skipped,
    store_id: context.storeId,
    products: nextProducts,
  };
}
