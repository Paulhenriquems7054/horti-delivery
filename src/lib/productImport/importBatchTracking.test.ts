import { describe, expect, it } from "vitest";
import {
  beginImportState,
  canFinishImport,
  computeExpectedBatches,
  finishImport,
  IMPORT_BATCH_SIZE,
  isMeaningfulBarcode,
  registerBatchCompleted,
  resolveCategoryId,
  simulateConcurrentBatchRegister,
  simulateImportRun,
  tryInsertProduct,
  type ProductImportState,
  type RegisteredBatch,
} from "./importBatchTracking";

describe("computeExpectedBatches", () => {
  it("calcula 65 batches para 19268 produtos", () => {
    expect(computeExpectedBatches(19_268)).toBe(65);
    expect(computeExpectedBatches(19_268, IMPORT_BATCH_SIZE)).toBe(Math.ceil(19_268 / 300));
  });

  it("retorna 0 para catálogo vazio", () => {
    expect(computeExpectedBatches(0)).toBe(0);
  });
});

describe("finish_product_import — contrato server-side", () => {
  const importId = "test-import";
  const storeId = "store-beira-rio";

  function stateWithBatches(completed: number, expected = 65): ProductImportState {
    return {
      id: importId,
      storeId,
      status: "running",
      expectedBatches: expected,
      batchesCompleted: completed,
    };
  }

  function registerN(
    state: ProductImportState,
    registered: RegisteredBatch[],
    n: number,
  ): { state: ProductImportState; registered: RegisteredBatch[] } {
    let s = state;
    let r = registered;
    for (let i = 1; i <= n; i += 1) {
      const result = registerBatchCompleted(s, r, importId, i);
      s = result.state;
      r = result.registered;
    }
    return { state: s, registered: r };
  }

  // Cenário A — 0/65
  it("rejeita finish com 0/65 batches (IMPORT_INCOMPLETE)", () => {
    const result = canFinishImport(stateWithBatches(0));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("IMPORT_INCOMPLETE");
      expect(result.remainingBatches).toBe(65);
    }
  });

  // Cenário B — 10/65 (já coberto acima)
  // Cenário C — 64/65
  it("rejeita finish com 64/65 batches (IMPORT_INCOMPLETE)", () => {
    const result = canFinishImport(stateWithBatches(64));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("IMPORT_INCOMPLETE");
      expect(result.remainingBatches).toBe(1);
    }
  });

  // Teste 1 — finish prematuro (10/65)
  it("rejeita finish com 10/65 batches (IMPORT_INCOMPLETE)", () => {
    const state = stateWithBatches(10);
    const result = canFinishImport(state);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("IMPORT_INCOMPLETE");
      expect(result.expectedBatches).toBe(65);
      expect(result.batchesCompleted).toBe(10);
      expect(result.remainingBatches).toBe(55);
      expect(result.message).toContain("IMPORT_INCOMPLETE");
    }
    expect(() => finishImport(state)).toThrow(/IMPORT_INCOMPLETE/);
  });

  // Teste 2 — finish completo
  it("permite finish com 65/65 batches", () => {
    let state = stateWithBatches(0);
    let registered: RegisteredBatch[] = [];
    const done = registerN(state, registered, 65);
    state = done.state;

    const result = canFinishImport(state);
    expect(result.ok).toBe(true);
    const finished = finishImport(state);
    expect(finished.status).toBe("completed");
  });

  // Teste 3 — status completed
  it("rejeita finish quando import já está completed", () => {
    const state: ProductImportState = {
      ...stateWithBatches(65),
      status: "completed",
    };
    const result = canFinishImport(state);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("IMPORT_NOT_FINALIZABLE");
      expect(result.message).toContain("completed");
    }
  });

  // Teste 4 — status failed
  it("rejeita finish quando import está failed", () => {
    const state: ProductImportState = {
      ...stateWithBatches(65),
      status: "failed",
    };
    const result = canFinishImport(state);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("IMPORT_NOT_FINALIZABLE");
      expect(result.message).toContain("failed");
    }
  });
});

describe("registerBatchCompleted — idempotência", () => {
  // Teste 5 — retry do mesmo batch
  it("batch 3 executado duas vezes incrementa batches_completed apenas uma vez", () => {
    const state = beginImportState("imp", "store", 900);
    let registered: RegisteredBatch[] = [];

    const first = registerBatchCompleted(state, registered, "imp", 3);
    expect(first.newlyCompleted).toBe(true);
    expect(first.state.batchesCompleted).toBe(1);

    const second = registerBatchCompleted(first.state, first.registered, "imp", 3);
    expect(second.newlyCompleted).toBe(false);
    expect(second.state.batchesCompleted).toBe(1);
  });

  // Teste 6 — concorrência
  it("sequência batch 1, retry 1, concorrente 1, batch 2 → +1 +0 +0 +1", () => {
    let state = beginImportState("imp", "store", 600);
    let registered: RegisteredBatch[] = [];

    const b1 = registerBatchCompleted(state, registered, "imp", 1);
    expect(b1.newlyCompleted).toBe(true);
    state = b1.state;
    registered = b1.registered;

    const b1retry = registerBatchCompleted(state, registered, "imp", 1);
    expect(b1retry.newlyCompleted).toBe(false);

    const concurrent = simulateConcurrentBatchRegister(state, registered, "imp", 1, 2);
    expect(concurrent.newlyCompletedCount).toBe(0);
    state = concurrent.state;
    registered = concurrent.registered;

    const b2 = registerBatchCompleted(state, registered, "imp", 2);
    expect(b2.newlyCompleted).toBe(true);
    expect(b2.state.batchesCompleted).toBe(2);
  });
});

describe("simulateImportRun — falha parcial e idempotência de produtos", () => {
  function makeProducts(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      internal_code: String(i + 1),
      barcode: i % 640 === 0 ? "0" : String(1000 + i),
      name: `PRODUTO ${i + 1}`,
      price: "1.00",
      category_id: i % 3 === 0 ? null : "cat-local",
    }));
  }

  // Teste 7 — retry após falha parcial (escala reduzida proporcional)
  it("retry após falha no batch 3 não duplica batches 1–2", () => {
    const products = makeProducts(900);
    const partial = simulateImportRun(products, "store-a", 300, { failAtBatch: 3 });
    expect(partial.finalState.batchesCompleted).toBe(2);
    expect(partial.totalInserted).toBe(600);

    const recovered = simulateImportRun(products, "store-a", 300, {
      failAtBatch: 3,
      retryAfterFailure: true,
    });
    expect(recovered.totalInserted).toBe(900);
    expect(recovered.finalState.batchesCompleted).toBe(3);
  });

  // Teste 8 — barcode 0
  it("permite múltiplos produtos com barcode 0 na mesma loja", () => {
    const index = { internalCodes: new Set<string>(), barcodes: new Set<string>() };
    const products = [
      { internal_code: "1", barcode: "0", name: "A", price: "1.00" },
      { internal_code: "2", barcode: "0", name: "B", price: "2.00" },
      { internal_code: "3", barcode: "00", name: "C", price: "3.00" },
    ];
    for (const p of products) {
      expect(tryInsertProduct(p, "store-a", index, new Map())).toBe("inserted");
    }
    expect(index.internalCodes.size).toBe(3);
  });

  // Teste 9 — EAN real duplicado
  it("bloqueia segundo produto com mesmo EAN real na mesma loja", () => {
    const index = { internalCodes: new Set<string>(), barcodes: new Set<string>() };
    const a = {
      internal_code: "1",
      barcode: "7891025121626",
      name: "A",
      price: "1.00",
    };
    const b = {
      internal_code: "2",
      barcode: "7891025121626",
      name: "B",
      price: "2.00",
    };
    expect(tryInsertProduct(a, "store-a", index, new Map())).toBe("inserted");
    expect(tryInsertProduct(b, "store-a", index, new Map())).toBe("skipped");
  });
});

describe("multi-tenancy — contrato", () => {
  // Teste 10 — store_id server-side (simulação: produtos sempre na loja do caller)
  it("inserts ficam vinculados ao storeId do caller, não a outro tenant", () => {
    const indexA = { internalCodes: new Set<string>(), barcodes: new Set<string>() };
    const indexB = { internalCodes: new Set<string>(), barcodes: new Set<string>() };
    const product = {
      internal_code: "999",
      barcode: "789000",
      name: "X",
      price: "1.00",
    };
    expect(tryInsertProduct(product, "store-beira-rio", indexA, new Map())).toBe("inserted");
    expect(tryInsertProduct(product, "store-outra", indexB, new Map())).toBe("inserted");
    expect(indexA.internalCodes.has("999")).toBe(true);
    expect(indexB.internalCodes.has("999")).toBe(true);
  });

  // Teste 11 — category cross-tenant
  it("category_id de outra loja vira NULL na resolução", () => {
    const resolved = resolveCategoryId("cat-x", "store-outra", "store-beira-rio");
    expect(resolved).toBeNull();
    const ok = resolveCategoryId("cat-y", "store-beira-rio", "store-beira-rio");
    expect(ok).toBe("cat-y");
  });
});

describe("isMeaningfulBarcode", () => {
  it("trata 0, 00, 000 como placeholder", () => {
    expect(isMeaningfulBarcode("0")).toBe(false);
    expect(isMeaningfulBarcode("00")).toBe(false);
    expect(isMeaningfulBarcode("000")).toBe(false);
    expect(isMeaningfulBarcode("7891025121626")).toBe(true);
  });
});
