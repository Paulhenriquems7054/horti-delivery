-- Importação de mercadorias por planilha (Beira Rio) — colunas, auditoria e RPCs

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS internal_code TEXT,
  ADD COLUMN IF NOT EXISTS barcode TEXT;

COMMENT ON COLUMN public.products.internal_code IS 'Código interno do ERP (ex.: planilha Beira Rio — coluna Código)';
COMMENT ON COLUMN public.products.barcode IS 'Código de barras / EAN (string, zeros à esquerda preservados)';

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_store_internal_code_active
  ON public.products (store_id, internal_code)
  WHERE internal_code IS NOT NULL AND active = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_store_barcode_active
  ON public.products (store_id, barcode)
  WHERE barcode IS NOT NULL AND barcode <> '' AND active = true;

CREATE INDEX IF NOT EXISTS idx_products_store_internal_code_lookup
  ON public.products (store_id, internal_code)
  WHERE internal_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_store_barcode_lookup
  ON public.products (store_id, barcode)
  WHERE barcode IS NOT NULL AND barcode <> '';

-- ---------------------------------------------------------------------------
-- Auditoria de importações
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  filename TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  inserted_rows INTEGER NOT NULL DEFAULT 0,
  skipped_existing_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_product_imports_store_started
  ON public.product_imports (store_id, started_at DESC);

ALTER TABLE public.product_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_imports_owner_select ON public.product_imports;
CREATE POLICY product_imports_owner_select ON public.product_imports
  FOR SELECT TO authenticated
  USING (public.is_store_owner(store_id) OR public.is_platform_admin());

REVOKE ALL ON public.product_imports FROM anon;
GRANT SELECT ON public.product_imports TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: iniciar importação (store_id sempre do servidor)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.begin_product_import(
  p_filename TEXT,
  p_total_rows INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
  v_import_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_store_id := public.get_my_store_id();
  IF v_store_id IS NULL OR NOT public.is_store_owner(v_store_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_filename IS NULL OR btrim(p_filename) = '' THEN
    RAISE EXCEPTION 'filename required';
  END IF;

  INSERT INTO public.product_imports (
    store_id,
    user_id,
    filename,
    status,
    total_rows
  )
  VALUES (
    v_store_id,
    auth.uid(),
    btrim(p_filename),
    'running',
    GREATEST(COALESCE(p_total_rows, 0), 0)
  )
  RETURNING id INTO v_import_id;

  RETURN v_import_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: lote de inserção (somente produtos novos — piloto v1)
-- Cada chamada é atômica; importações grandes usam vários lotes sequenciais.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.import_product_batch(
  p_import_id UUID,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
  v_item JSONB;
  v_internal_code TEXT;
  v_barcode TEXT;
  v_name TEXT;
  v_price NUMERIC;
  v_inserted INTEGER := 0;
  v_skipped INTEGER := 0;
  v_errors INTEGER := 0;
  v_error_details JSONB := '[]'::JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_store_id := public.get_my_store_id();
  IF v_store_id IS NULL OR NOT public.is_store_owner(v_store_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_import_id IS NULL THEN
    RAISE EXCEPTION 'import_id required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_imports pi
    WHERE pi.id = p_import_id
      AND pi.store_id = v_store_id
      AND pi.user_id = auth.uid()
      AND pi.status = 'running'
  ) THEN
    RAISE EXCEPTION 'import not found or not running';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'items must be a json array';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_internal_code := NULLIF(btrim(v_item->>'internal_code'), '');
      v_barcode := NULLIF(btrim(v_item->>'barcode'), '');
      v_name := NULLIF(btrim(v_item->>'name'), '');
      v_price := NULL;

      IF v_internal_code IS NULL THEN
        v_errors := v_errors + 1;
        v_error_details := v_error_details || jsonb_build_array(
          jsonb_build_object('reason', 'missing internal_code', 'item', v_item)
        );
        CONTINUE;
      END IF;

      IF v_name IS NULL THEN
        v_errors := v_errors + 1;
        v_error_details := v_error_details || jsonb_build_array(
          jsonb_build_object('reason', 'missing name', 'item', v_item)
        );
        CONTINUE;
      END IF;

      BEGIN
        v_price := (v_item->>'price')::NUMERIC;
      EXCEPTION WHEN OTHERS THEN
        v_price := NULL;
      END;

      IF v_price IS NULL OR v_price < 0 THEN
        v_errors := v_errors + 1;
        v_error_details := v_error_details || jsonb_build_array(
          jsonb_build_object('reason', 'invalid price', 'item', v_item)
        );
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.products p
        WHERE p.store_id = v_store_id
          AND p.active = true
          AND (
            p.internal_code = v_internal_code
            OR (v_barcode IS NOT NULL AND p.barcode = v_barcode)
            OR LOWER(p.name) = LOWER(v_name)
          )
      ) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.products (
        name,
        price,
        unit,
        active,
        store_id,
        internal_code,
        barcode,
        sell_by,
        price_per_unit,
        average_weight,
        weight_variance
      )
      VALUES (
        v_name,
        v_price,
        'un',
        true,
        v_store_id,
        v_internal_code,
        v_barcode,
        'unit',
        v_price,
        0.3,
        0.15
      );

      v_inserted := v_inserted + 1;
    EXCEPTION WHEN unique_violation THEN
      v_skipped := v_skipped + 1;
    WHEN OTHERS THEN
      v_errors := v_errors + 1;
      v_error_details := v_error_details || jsonb_build_array(
        jsonb_build_object('reason', SQLERRM, 'item', v_item)
      );
    END;
  END LOOP;

  UPDATE public.product_imports pi
  SET
    inserted_rows = pi.inserted_rows + v_inserted,
    skipped_existing_rows = pi.skipped_existing_rows + v_skipped,
    error_rows = pi.error_rows + v_errors
  WHERE pi.id = p_import_id;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'skipped_existing', v_skipped,
    'errors', v_errors,
    'error_details', v_error_details
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: finalizar importação + auditoria
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finish_product_import(
  p_import_id UUID,
  p_metadata JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
  v_row public.product_imports%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_store_id := public.get_my_store_id();
  IF v_store_id IS NULL OR NOT public.is_store_owner(v_store_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_row
  FROM public.product_imports pi
  WHERE pi.id = p_import_id
    AND pi.store_id = v_store_id
    AND pi.user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'import not found';
  END IF;

  UPDATE public.product_imports pi
  SET
    status = 'completed',
    finished_at = now(),
    metadata = COALESCE(p_metadata, pi.metadata)
  WHERE pi.id = p_import_id
  RETURNING * INTO v_row;

  PERFORM public.log_audit_event(
    v_store_id,
    'product_import',
    jsonb_build_object(
      'import_id', p_import_id,
      'filename', v_row.filename,
      'total_rows', v_row.total_rows,
      'inserted_rows', v_row.inserted_rows,
      'skipped_existing_rows', v_row.skipped_existing_rows,
      'error_rows', v_row.error_rows,
      'metadata', COALESCE(p_metadata, v_row.metadata)
    )
  );

  RETURN jsonb_build_object(
    'import_id', p_import_id,
    'status', 'completed',
    'inserted_rows', v_row.inserted_rows,
    'skipped_existing_rows', v_row.skipped_existing_rows,
    'error_rows', v_row.error_rows
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.begin_product_import(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_product_batch(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_product_import(UUID, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.begin_product_import(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.import_product_batch(UUID, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.finish_product_import(UUID, JSONB) FROM anon;
