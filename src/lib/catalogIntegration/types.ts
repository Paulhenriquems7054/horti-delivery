/**
 * Contrato interno normalizado para sincronização de catálogo externo (PDV).
 * Adapters convertem formatos específicos de fornecedor para este tipo.
 */

export type ExternalCatalogCategory = {
  externalId?: string;
  name?: string;
};

export type ExternalCatalogProduct = {
  externalId: string;
  internalCode?: string;
  barcode?: string | null;
  name: string;
  price: number;
  active: boolean;
  category?: ExternalCatalogCategory;
  updatedAt?: string;
};

export type CatalogSyncAction =
  | "CREATE"
  | "UPDATE"
  | "SKIP"
  | "CONFLICT"
  | "DEACTIVATE";

export type CatalogSyncItemResult = {
  action: CatalogSyncAction;
  externalId: string;
  productId?: string;
  reason?: string;
};

export type CatalogSyncSummary = {
  created: number;
  updated: number;
  skipped: number;
  conflicts: number;
  deactivated: number;
  errors: number;
  items: CatalogSyncItemResult[];
};

export type IntegrationProvider = string;

export type StoreIntegrationStatus =
  | "pending"
  | "connected"
  | "disconnected"
  | "error";

export type StoreIntegrationType = "catalog";

export type StoreIntegrationRecord = {
  id: string;
  storeId: string;
  provider: IntegrationProvider;
  integrationType: StoreIntegrationType;
  status: StoreIntegrationStatus;
  /** Config não sensível — secrets ficam server-side (Vault) */
  config: Record<string, unknown>;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
};

export type ExternalProductIdentifier = {
  storeId: string;
  provider: IntegrationProvider;
  externalId: string;
  productId: string;
  externalCode?: string | null;
};

export type CatalogSyncRunStatus = "running" | "completed" | "failed" | "partial";

export type CatalogSyncRunRecord = {
  id: string;
  storeId: string;
  integrationId: string;
  status: CatalogSyncRunStatus;
  startedAt: string;
  finishedAt: string | null;
  totalReceived: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  conflictCount: number;
  errorCount: number;
  metadata?: Record<string, unknown>;
  errorSummary?: string | null;
};
