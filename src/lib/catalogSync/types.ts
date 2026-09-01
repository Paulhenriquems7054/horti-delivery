/**
 * Contrato interno normalizado — independente de fornecedor PDV.
 * Não inclui store_id, tenant_id ou category_id interno.
 */

export type NormalizedExternalCategory = {
  externalId?: string | null;
  name?: string | null;
};

export type NormalizedCatalogProduct = {
  externalId: string;
  internalCode?: string | null;
  barcode?: string | null;
  name: string;
  price?: number | null;
  active?: boolean | null;
  externalCategory?: NormalizedExternalCategory | null;
  updatedAt?: string | null;
};

export type CatalogSyncAction = "CREATE" | "UPDATE" | "SKIP" | "CONFLICT" | "ERROR";

/** Códigos estáveis — nunca usar mensagens livres como lógica de negócio. */
export type CatalogSyncReasonCode =
  | "EXTERNAL_ID_MATCH"
  | "INTERNAL_CODE_MATCH"
  | "BARCODE_MATCH"
  | "MISSING_EXTERNAL_ID"
  | "MISSING_NAME"
  | "INVALID_PRODUCT"
  | "INVALID_PRICE"
  | "IDENTITY_CONFLICT"
  | "DUPLICATE_EXTERNAL_ID"
  | "DUPLICATE_INTERNAL_CODE"
  | "CROSS_TENANT_REJECTED"
  | "PRODUCT_NOT_IN_CONTEXT"
  | "NO_CHANGE"
  | "DEACTIVATE_REQUESTED"
  | "CREATE_NEW";

export type CatalogSyncDecision = {
  action: CatalogSyncAction;
  reasonCode: CatalogSyncReasonCode;
  externalId: string;
  productId?: string | null;
  matchedBy?: "external_id" | "internal_code" | "barcode" | null;
};

export type ExternalIdentifierRow = {
  storeId: string;
  provider: string;
  externalId: string;
  productId: string;
};

export type CatalogProductRef = {
  id: string;
  storeId: string;
  internalCode: string | null;
  barcode: string | null;
  name: string;
  categoryId: string | null;
  price?: number | null;
  active?: boolean | null;
};

export type ResolveCatalogSyncContext = {
  storeId: string;
  provider: string;
  /** Apenas produtos da mesma loja */
  products: CatalogProductRef[];
  externalIdentifiers: ExternalIdentifierRow[];
};
