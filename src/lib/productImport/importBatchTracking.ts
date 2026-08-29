/**
 * Contrato de controle de batches — espelha a lógica das RPCs SQL (migration 28290000).
 * Usado em testes unitários sem banco.
 */

export const IMPORT_BATCH_SIZE = 300;

export type ImportStatus = "running" | "completed" | "failed";

export interface ProductImportState {
  id: string;
  storeId: string;
  status: ImportStatus;
  expectedBatches: number;
  batchesCompleted: number;
}

export interface RegisteredBatch {
  importId: string;
  batchNumber: number;
}

export interface FinishImportResult {
  ok: true;
  status: "completed";
}

export interface FinishImportError {
  ok: false;
  code: "IMPORT_NOT_FINALIZABLE" | "IMPORT_INCOMPLETE" | "IMPORT_NOT_FOUND";
  message: string;
  expectedBatches?: number;
  batchesCompleted?: number;
  remainingBatches?: number;
}

export type FinishImportOutcome = FinishImportResult | FinishImportError;

export interface ProductRecord {
  internal_code: string;
  barcode: string;
  name: string;
  price: string;
  category_id?: string | null;
}

export function computeExpectedBatches(importableCount: number, batchSize = IMPORT_BATCH_SIZE): number {
  if (importableCount <= 0) return 0;
  return Math.ceil(importableCount / batchSize);
}

export function beginImportState(
  importId: string,
  storeId: string,
  importableCount: number,
): ProductImportState {
  return {
    id: importId,
    storeId,
    status: "running",
    expectedBatches: computeExpectedBatches(importableCount),
    batchesCompleted: 0,
  };
}

/**
 * Registra batch de forma idempotente (equivalente a INSERT ON CONFLICT DO NOTHING + incremento).
 * Retorna true se este batch foi contabilizado pela primeira vez.
 */
export function registerBatchCompleted(
  state: ProductImportState,
  registered: RegisteredBatch[],
  importId: string,
  batchNumber: number,
): { state: ProductImportState; registered: RegisteredBatch[]; newlyCompleted: boolean } {
  if (batchNumber < 1 || batchNumber > state.expectedBatches) {
    throw new Error(`batch_number ${batchNumber} exceeds expected_batches ${state.expectedBatches}`);
  }

  const exists = registered.some((b) => b.importId === importId && b.batchNumber === batchNumber);
  if (exists) {
    return { state, registered, newlyCompleted: false };
  }

  return {
    state: { ...state, batchesCompleted: state.batchesCompleted + 1 },
    registered: [...registered, { importId, batchNumber }],
    newlyCompleted: true,
  };
}

export function canFinishImport(state: ProductImportState): FinishImportOutcome {
  if (state.status !== "running") {
    return {
      ok: false,
      code: "IMPORT_NOT_FINALIZABLE",
      message: `IMPORT_NOT_FINALIZABLE: status is ${state.status}`,
    };
  }

  if (state.expectedBatches <= 0) {
    return {
      ok: false,
      code: "IMPORT_INCOMPLETE",
      message: "IMPORT_INCOMPLETE: expected_batches not configured",
      expectedBatches: state.expectedBatches,
      batchesCompleted: state.batchesCompleted,
    };
  }

  if (state.batchesCompleted < state.expectedBatches) {
    const remaining = state.expectedBatches - state.batchesCompleted;
    return {
      ok: false,
      code: "IMPORT_INCOMPLETE",
      message: `IMPORT_INCOMPLETE: expected=${state.expectedBatches}, completed=${state.batchesCompleted}, remaining=${remaining}`,
      expectedBatches: state.expectedBatches,
      batchesCompleted: state.batchesCompleted,
      remainingBatches: remaining,
    };
  }

  return { ok: true, status: "completed" };
}

export function finishImport(state: ProductImportState): ProductImportState {
  const check = canFinishImport(state);
  if (!check.ok) {
    throw new Error(check.message);
  }
  return { ...state, status: "completed" };
}

export function isMeaningfulBarcode(barcode: string): boolean {
  const b = barcode.trim();
  if (!b || b === "0" || /^0+$/.test(b)) return false;
  return true;
}

export function resolveCategoryId(
  categoryId: string | null | undefined,
  categoryStoreId: string | null,
  callerStoreId: string,
): string | null {
  if (!categoryId) return null;
  if (!categoryStoreId || categoryStoreId !== callerStoreId) return null;
  return categoryId;
}

export interface StoreProductIndex {
  internalCodes: Set<string>;
  barcodes: Set<string>;
}

export function tryInsertProduct(
  product: ProductRecord,
  storeId: string,
  index: StoreProductIndex,
  categoryStoreById: Map<string, string>,
): "inserted" | "skipped" {
  const resolvedCategory = resolveCategoryId(
    product.category_id,
    product.category_id ? categoryStoreById.get(product.category_id) ?? null : null,
    storeId,
  );
  void resolvedCategory;

  if (index.internalCodes.has(product.internal_code)) return "skipped";
  if (isMeaningfulBarcode(product.barcode) && index.barcodes.has(product.barcode)) {
    return "skipped";
  }

  index.internalCodes.add(product.internal_code);
  if (product.barcode) index.barcodes.add(product.barcode);
  return "inserted";
}

export function simulateImportRun(
  products: ProductRecord[],
  storeId: string,
  batchSize = IMPORT_BATCH_SIZE,
  options?: {
    failAtBatch?: number;
    retryAfterFailure?: boolean;
    categoryStoreById?: Map<string, string>;
  },
): {
  totalInserted: number;
  finalState: ProductImportState;
  registered: RegisteredBatch[];
} {
  const importId = "sim-import";
  let state = beginImportState(importId, storeId, products.length);
  let registered: RegisteredBatch[] = [];
  const index: StoreProductIndex = { internalCodes: new Set(), barcodes: new Set() };
  const categoryStoreById = options?.categoryStoreById ?? new Map<string, string>();
  let totalInserted = 0;

  const processBatch = (batchNum: number) => {
    const offset = (batchNum - 1) * batchSize;
    const batch = products.slice(offset, offset + batchSize);
    for (const p of batch) {
      if (tryInsertProduct(p, storeId, index, categoryStoreById) === "inserted") {
        totalInserted += 1;
      }
    }
    const reg = registerBatchCompleted(state, registered, importId, batchNum);
    state = reg.state;
    registered = reg.registered;
  };

  const totalBatches = state.expectedBatches;
  const failAt = options?.failAtBatch;

  if (failAt && options?.retryAfterFailure) {
    for (let batchNum = 1; batchNum < failAt; batchNum += 1) {
      processBatch(batchNum);
    }
    for (let batchNum = failAt; batchNum <= totalBatches; batchNum += 1) {
      processBatch(batchNum);
    }
  } else if (failAt) {
    for (let batchNum = 1; batchNum < failAt; batchNum += 1) {
      processBatch(batchNum);
    }
  } else {
    for (let batchNum = 1; batchNum <= totalBatches; batchNum += 1) {
      processBatch(batchNum);
    }
  }

  return { totalInserted, finalState: state, registered };
}

export function simulateConcurrentBatchRegister(
  state: ProductImportState,
  registered: RegisteredBatch[],
  importId: string,
  batchNumber: number,
  concurrentAttempts: number,
): { state: ProductImportState; registered: RegisteredBatch[]; newlyCompletedCount: number } {
  let currentState = state;
  let currentRegistered = registered;
  let newlyCompletedCount = 0;

  for (let i = 0; i < concurrentAttempts; i += 1) {
    const result = registerBatchCompleted(currentState, currentRegistered, importId, batchNumber);
    currentState = result.state;
    currentRegistered = result.registered;
    if (result.newlyCompleted) newlyCompletedCount += 1;
  }

  return {
    state: currentState,
    registered: currentRegistered,
    newlyCompletedCount,
  };
}
