-- Controle server-side de batches na importação (fix FINISH_PREMATURE)

ALTER TABLE public.product_imports
  ADD COLUMN IF NOT EXISTS expected_batches INTEGER,
  ADD COLUMN IF NOT EXISTS batches_completed INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.product_imports
  DROP CONSTRAINT IF EXISTS product_imports_expected_batches_nonneg;

ALTER TABLE public.product_imports
  ADD CONSTRAINT product_imports_expected_batches_nonneg
  CHECK (expected_batches IS NULL OR expected_batches >= 0);

ALTER TABLE public.product_imports
  DROP CONSTRAINT IF EXISTS product_imports_batches_completed_nonneg;

ALTER TABLE public.product_imports
  ADD CONSTRAINT product_imports_batches_completed_nonneg
  CHECK (batches_completed >= 0);

ALTER TABLE public.product_imports
  DROP CONSTRAINT IF EXISTS product_imports_batches_completed_lte_expected;

ALTER TABLE public.product_imports
  ADD CONSTRAINT product_imports_batches_completed_lte_expected
  CHECK (expected_batches IS NULL OR batches_completed <= expected_batches);

-- Registro idempotente de batches processados (unicidade import_id + batch_number)
CREATE TABLE IF NOT EXISTS public.product_import_batches (
  import_id UUID NOT NULL REFERENCES public.product_imports(id) ON DELETE CASCADE,
  batch_number INTEGER NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  items_inserted INTEGER NOT NULL DEFAULT 0,
  items_skipped INTEGER NOT NULL DEFAULT 0,
  items_errors INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (import_id, batch_number),
  CONSTRAINT product_import_batches_number_positive CHECK (batch_number >= 1)
);

CREATE INDEX IF NOT EXISTS idx_product_import_batches_import
  ON public.product_import_batches (import_id, batch_number);

ALTER TABLE public.product_import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_import_batches_owner_select ON public.product_import_batches;
CREATE POLICY product_import_batches_owner_select ON public.product_import_batches
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.product_imports pi
      WHERE pi.id = product_import_batches.import_id
        AND (public.is_store_owner(pi.store_id) OR public.is_platform_admin())
    )
  );

REVOKE ALL ON public.product_import_batches FROM anon;
GRANT SELECT ON public.product_import_batches TO authenticated;

-- Tamanho de lote alinhado ao cliente (IMPORT_BATCH_SIZE = 300)
CREATE OR REPLACE FUNCTION public.begin_product_import(
  p_filename TEXT,
  p_total_rows INTEGER DEFAULT 0,
  p_importable_count INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
  v_import_id UUID;
  v_importable INTEGER;
  v_expected_batches INTEGER;
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

  v_importable := GREATEST(COALESCE(p_importable_count, 0), 0);
  IF v_importable = 0 THEN
    v_expected_batches := 0;
  ELSE
    v_expected_batches := CEIL(v_importable::NUMERIC / 300)::INTEGER;
  END IF;

  INSERT INTO public.product_imports (
    store_id,
    user_id,
    filename,
    status,
    total_rows,
    expected_batches,
    batches_completed
  )
  VALUES (
    v_store_id,
    auth.uid(),
    btrim(p_filename),
    'running',
    GREATEST(COALESCE(p_total_rows, 0), 0),
    v_expected_batches,
    0
  )
  RETURNING id INTO v_import_id;

  RETURN v_import_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.import_product_batch(
  p_import_id UUID,
  p_batch_number INTEGER,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
  v_import public.product_imports%ROWTYPE;
  v_item JSONB;
  v_internal_code TEXT;
  v_barcode TEXT;
  v_name TEXT;
  v_price NUMERIC;
  v_category_id UUID;
  v_inserted INTEGER := 0;
  v_skipped INTEGER := 0;
  v_errors INTEGER := 0;
  v_error_details JSONB := '[]'::JSONB;
  v_batch_registered BOOLEAN := false;
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

  IF p_batch_number IS NULL OR p_batch_number < 1 THEN
    RAISE EXCEPTION 'batch_number must be >= 1';
  END IF;

  SELECT * INTO v_import
  FROM public.product_imports pi
  WHERE pi.id = p_import_id
    AND pi.store_id = v_store_id
    AND pi.user_id = auth.uid()
    AND pi.status = 'running';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'import not found or not running';
  END IF;

  IF v_import.expected_batches IS NULL OR v_import.expected_batches <= 0 THEN
    RAISE EXCEPTION 'import has no expected batches';
  END IF;

  IF p_batch_number > v_import.expected_batches THEN
    RAISE EXCEPTION 'batch_number % exceeds expected_batches %',
      p_batch_number, v_import.expected_batches;
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
      v_category_id := NULL;

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

      IF NULLIF(v_item->>'category_id', '') IS NOT NULL THEN
        BEGIN
          v_category_id := (v_item->>'category_id')::UUID;
        EXCEPTION WHEN OTHERS THEN
          v_category_id := NULL;
        END;

        IF v_category_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM public.categories c
          WHERE c.id = v_category_id
            AND c.store_id = v_store_id
            AND c.active = true
        ) THEN
          v_category_id := NULL;
        END IF;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.products p
        WHERE p.store_id = v_store_id
          AND p.active = true
          AND (
            p.internal_code = v_internal_code
            OR (
              v_barcode IS NOT NULL
              AND v_barcode <> '0'
              AND v_barcode !~ '^0+$'
              AND p.barcode = v_barcode
            )
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
        category_id,
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
        v_category_id,
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

  -- Idempotência: só contabiliza batch na primeira vez (PK + ON CONFLICT DO NOTHING)
  v_batch_registered := false;

  INSERT INTO public.product_import_batches (
    import_id,
    batch_number,
    items_inserted,
    items_skipped,
    items_errors
  )
  VALUES (
    p_import_id,
    p_batch_number,
    v_inserted,
    v_skipped,
    v_errors
  )
  ON CONFLICT (import_id, batch_number) DO NOTHING
  RETURNING true INTO v_batch_registered;

  IF v_batch_registered THEN
    UPDATE public.product_imports pi
    SET batches_completed = pi.batches_completed + 1
    WHERE pi.id = p_import_id;
  END IF;

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
    'error_details', v_error_details,
    'batch_number', p_batch_number,
    'batch_newly_completed', v_batch_registered
  );
END;
$$;

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
  v_remaining INTEGER;
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
    AND pi.user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'import not found';
  END IF;

  IF v_row.status <> 'running' THEN
    RAISE EXCEPTION 'IMPORT_NOT_FINALIZABLE: status is %', v_row.status;
  END IF;

  IF v_row.expected_batches IS NULL OR v_row.expected_batches <= 0 THEN
    RAISE EXCEPTION 'IMPORT_INCOMPLETE: expected_batches not configured';
  END IF;

  IF v_row.batches_completed < v_row.expected_batches THEN
    v_remaining := v_row.expected_batches - v_row.batches_completed;
    RAISE EXCEPTION 'IMPORT_INCOMPLETE: expected=%, completed=%, remaining=%',
      v_row.expected_batches,
      v_row.batches_completed,
      v_remaining;
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
      'expected_batches', v_row.expected_batches,
      'batches_completed', v_row.batches_completed,
      'inserted_rows', v_row.inserted_rows,
      'skipped_existing_rows', v_row.skipped_existing_rows,
      'error_rows', v_row.error_rows,
      'metadata', COALESCE(p_metadata, v_row.metadata)
    )
  );

  RETURN jsonb_build_object(
    'import_id', p_import_id,
    'status', 'completed',
    'expected_batches', v_row.expected_batches,
    'batches_completed', v_row.batches_completed,
    'inserted_rows', v_row.inserted_rows,
    'skipped_existing_rows', v_row.skipped_existing_rows,
    'error_rows', v_row.error_rows
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_product_import(
  p_import_id UUID,
  p_reason TEXT DEFAULT NULL
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
    AND pi.user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'import not found';
  END IF;

  IF v_row.status <> 'running' THEN
    RAISE EXCEPTION 'IMPORT_NOT_FAILABLE: status is %', v_row.status;
  END IF;

  UPDATE public.product_imports pi
  SET
    status = 'failed',
    finished_at = now(),
    metadata = COALESCE(pi.metadata, '{}'::JSONB) || jsonb_build_object(
      'fail_reason', NULLIF(btrim(p_reason), ''),
      'failed_at', now()
    )
  WHERE pi.id = p_import_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'import_id', p_import_id,
    'status', 'failed',
    'batches_completed', v_row.batches_completed,
    'expected_batches', v_row.expected_batches
  );
END;
$$;

REVOKE ALL ON FUNCTION public.begin_product_import(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.begin_product_import(TEXT, INTEGER) FROM authenticated;
REVOKE ALL ON FUNCTION public.begin_product_import(TEXT, INTEGER) FROM anon;

REVOKE ALL ON FUNCTION public.import_product_batch(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_product_batch(UUID, JSONB) FROM authenticated;
REVOKE ALL ON FUNCTION public.import_product_batch(UUID, JSONB) FROM anon;

GRANT EXECUTE ON FUNCTION public.begin_product_import(TEXT, INTEGER, INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION public.begin_product_import(TEXT, INTEGER, INTEGER) FROM anon;

GRANT EXECUTE ON FUNCTION public.import_product_batch(UUID, INTEGER, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.import_product_batch(UUID, INTEGER, JSONB) FROM anon;

GRANT EXECUTE ON FUNCTION public.finish_product_import(UUID, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.finish_product_import(UUID, JSONB) FROM anon;

GRANT EXECUTE ON FUNCTION public.fail_product_import(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.fail_product_import(UUID, TEXT) FROM anon;
