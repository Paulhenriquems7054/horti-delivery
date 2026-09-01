/**
 * Adapter genérico — cada fornecedor de PDV implementa `toExternalCatalogProduct`.
 */
import type { ExternalCatalogProduct } from "./types";

export type PdvAdapter<TPayload> = {
  provider: string;
  normalize(payload: TPayload): ExternalCatalogProduct;
  normalizeBatch(payloads: TPayload[]): ExternalCatalogProduct[];
};

export function createPdvAdapter<TPayload>(
  provider: string,
  normalizeOne: (payload: TPayload) => ExternalCatalogProduct,
): PdvAdapter<TPayload> {
  return {
    provider,
    normalize: normalizeOne,
    normalizeBatch: (payloads) => payloads.map(normalizeOne),
  };
}

/** Exemplo ilustrativo — não acoplado a fornecedor real */
export type ExamplePdvRow = {
  id: string;
  codigo?: string;
  ean?: string;
  descricao: string;
  preco: number;
  ativo: boolean;
};

export const examplePdvAdapter = createPdvAdapter<ExamplePdvRow>("pdv_exemplo", (row) => ({
  externalId: row.id,
  internalCode: row.codigo,
  barcode: row.ean ?? null,
  name: row.descricao,
  price: row.preco,
  active: row.ativo,
}));
