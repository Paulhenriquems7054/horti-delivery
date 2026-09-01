import { describe, expect, it } from "vitest";
import {
  applyPdvPatchToExisting,
  planCatalogSyncItem,
  runCatalogSyncPlan,
  validateExternalPrice,
  type SyncEngineContext,
} from "./syncEngine";
import type { ExternalCatalogProduct } from "./types";

function baseCtx(overrides?: Partial<SyncEngineContext>): SyncEngineContext {
  return {
    storeId: "store-1",
    provider: "pdv_test",
    productsById: new Map([
      [
        "p1",
        {
          id: "p1",
          name: "Prod A",
          price: 10,
          active: true,
          internalCode: "100",
          barcode: "7891025121626",
          categoryId: "cat-1",
        },
      ],
    ]),
    storeProducts: [{ id: "p1", internalCode: "100", barcode: "7891025121626" }],
    externalIndex: new Map([["pdv_test:ext-1", "p1"]]),
    ...overrides,
  };
}

describe("catalogIntegration syncEngine", () => {
  it("UPDATE para produto existente via external_id", () => {
    const item: ExternalCatalogProduct = {
      externalId: "ext-1",
      name: "Prod A Atualizado",
      price: 11,
      active: true,
    };
    expect(planCatalogSyncItem(item, baseCtx()).action).toBe("UPDATE");
  });

  it("CREATE para external_id desconhecido", () => {
    const item: ExternalCatalogProduct = {
      externalId: "ext-new",
      internalCode: "999",
      name: "Novo",
      price: 3,
      active: true,
    };
    expect(planCatalogSyncItem(item, baseCtx()).action).toBe("CREATE");
  });

  it("preço inválido → SKIP controlado", () => {
    expect(validateExternalPrice(-1).ok).toBe(false);
    expect(validateExternalPrice(Number.NaN).ok).toBe(false);
    const r = planCatalogSyncItem(
      { externalId: "ext-1", name: "X", price: -5, active: true },
      baseCtx(),
    );
    expect(r.action).toBe("SKIP");
    expect(r.reason).toBe("price_negative");
  });

  it("preço válido altera no merge", () => {
    const ctx = baseCtx();
    const existing = ctx.productsById.get("p1")!;
    const merged = applyPdvPatchToExisting(existing, {
      externalId: "ext-1",
      name: "Novo nome",
      price: 12.5,
      active: true,
    }, ctx);
    expect(merged.price).toBe(12.5);
    expect(merged.categoryId).toBe("cat-1");
  });

  it("DEACTIVATE quando PDV marca inativo", () => {
    const r = planCatalogSyncItem(
      { externalId: "ext-1", name: "Prod A", price: 10, active: false },
      baseCtx(),
    );
    expect(r.action).toBe("DEACTIVATE");
  });

  it("idempotência — segunda execução sem CREATE duplicado", () => {
    const items: ExternalCatalogProduct[] = [
      { externalId: "ext-new", internalCode: "888", name: "N", price: 1, active: true },
    ];
    const ctx1 = baseCtx();
    const run1 = runCatalogSyncPlan(items, ctx1);
    expect(run1.created).toBe(1);

    const ctx2 = baseCtx({
      externalIndex: new Map([["pdv_test:ext-new", "p-new"]]),
      productsById: new Map([
        ...baseCtx().productsById.entries(),
        [
          "p-new",
          {
            id: "p-new",
            name: "N",
            price: 1,
            active: true,
            internalCode: "888",
            barcode: null,
            categoryId: null,
          },
        ],
      ]),
      storeProducts: [
        ...baseCtx().storeProducts,
        { id: "p-new", internalCode: "888", barcode: null },
      ],
    });
    const run2 = runCatalogSyncPlan(items, ctx2);
    expect(run2.created).toBe(0);
    expect(run2.updated).toBe(1);
  });

  it("CONFLICT em código interno duplicado sem external_id", () => {
    const ctx = baseCtx({
      storeProducts: [
        { id: "a", internalCode: "DUP", barcode: null },
        { id: "b", internalCode: "DUP", barcode: null },
      ],
      externalIndex: new Map(),
      productsById: new Map(),
    });
    const r = planCatalogSyncItem(
      { externalId: "x", internalCode: "DUP", name: "X", price: 1, active: true },
      ctx,
    );
    expect(r.action).toBe("CONFLICT");
    expect(r.reason).toBe("duplicate_internal_code");
  });

  it("resumo agrega contagens", () => {
    const summary = runCatalogSyncPlan(
      [
        { externalId: "ext-1", name: "A", price: 1, active: true },
        { externalId: "ext-new", name: "B", price: 2, active: true },
        { externalId: "bad", name: "C", price: -1, active: true },
      ],
      baseCtx(),
    );
    expect(summary.updated).toBe(1);
    expect(summary.created).toBe(1);
    expect(summary.skipped).toBe(1);
  });
});
