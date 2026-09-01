-- PROPOSTA LOCAL — NÃO APLICADA NO HOSTED
-- Prepara integração genérica com PDV (store_integrations, identidade externa, sync runs)
-- Aplicar somente após revisão e autorização explícita.

-- ---------------------------------------------------------------------------
-- Integrações por loja (config não sensível; secrets via Vault/service role)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  integration_type TEXT NOT NULL CHECK (integration_type IN ('catalog')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'connected', 'disconnected', 'error')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, provider, integration_type)
);

CREATE INDEX IF NOT EXISTS idx_store_integrations_store
  ON public.store_integrations (store_id, status);

ALTER TABLE public.store_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_integrations_owner_select ON public.store_integrations;
CREATE POLICY store_integrations_owner_select ON public.store_integrations
  FOR SELECT TO authenticated
  USING (public.is_store_owner(store_id) OR public.is_platform_admin());

REVOKE ALL ON public.store_integrations FROM anon;
GRANT SELECT ON public.store_integrations TO authenticated;

-- ---------------------------------------------------------------------------
-- Mapeamento de identidade externa (provider + external_id por loja)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_external_identifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  external_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_product_external_identifiers_product
  ON public.product_external_identifiers (product_id);

CREATE INDEX IF NOT EXISTS idx_product_external_identifiers_lookup
  ON public.product_external_identifiers (store_id, provider, external_id);

ALTER TABLE public.product_external_identifiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_external_identifiers_owner_select ON public.product_external_identifiers;
CREATE POLICY product_external_identifiers_owner_select ON public.product_external_identifiers
  FOR SELECT TO authenticated
  USING (public.is_store_owner(store_id) OR public.is_platform_admin());

REVOKE ALL ON public.product_external_identifiers FROM anon;
GRANT SELECT ON public.product_external_identifiers TO authenticated;

-- ---------------------------------------------------------------------------
-- Log de sincronizações
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.store_integrations(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  total_received INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  conflict_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  error_summary TEXT
);

CREATE INDEX IF NOT EXISTS idx_catalog_sync_runs_store_started
  ON public.catalog_sync_runs (store_id, started_at DESC);

ALTER TABLE public.catalog_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_sync_runs_owner_select ON public.catalog_sync_runs;
CREATE POLICY catalog_sync_runs_owner_select ON public.catalog_sync_runs
  FOR SELECT TO authenticated
  USING (public.is_store_owner(store_id) OR public.is_platform_admin());

REVOKE ALL ON public.catalog_sync_runs FROM anon;
GRANT SELECT ON public.catalog_sync_runs TO authenticated;

CREATE TABLE IF NOT EXISTS public.catalog_sync_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id UUID NOT NULL REFERENCES public.catalog_sync_runs(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  external_id TEXT,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'SKIP', 'CONFLICT', 'DEACTIVATE', 'ERROR')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_sync_items_run
  ON public.catalog_sync_items (sync_run_id);

ALTER TABLE public.catalog_sync_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_sync_items_owner_select ON public.catalog_sync_items;
CREATE POLICY catalog_sync_items_owner_select ON public.catalog_sync_items
  FOR SELECT TO authenticated
  USING (public.is_store_owner(store_id) OR public.is_platform_admin());

REVOKE ALL ON public.catalog_sync_items FROM anon;
GRANT SELECT ON public.catalog_sync_items TO authenticated;

-- NOTA: RPCs de sync (service role / edge function) devem:
-- 1. Autenticar credencial da integração
-- 2. Resolver store_id a partir de store_integrations.id (nunca do payload)
-- 3. Upsert produtos respeitando ownership de campos (preservar category_id)
-- 4. Registrar catalog_sync_runs + catalog_sync_items
