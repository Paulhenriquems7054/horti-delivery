-- Backfill seguro de category_id para produtos existentes (somente NULL).
-- Não sobrescreve categorias existentes. Multi-tenant via get_my_store_id().

CREATE OR REPLACE FUNCTION public.backfill_product_categories_batch(
  p_assignments JSONB
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
  v_category_id UUID;
  v_product_id UUID;
  v_match_count INTEGER;
  v_updated INTEGER := 0;
  v_skipped INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_store_id := public.get_my_store_id();
  IF v_store_id IS NULL OR NOT public.is_store_owner(v_store_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_assignments IS NULL OR jsonb_typeof(p_assignments) <> 'array' THEN
    RAISE EXCEPTION 'assignments must be a json array';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_assignments)
  LOOP
    BEGIN
      v_internal_code := NULLIF(TRIM(v_item->>'internal_code'), '');
      v_barcode := NULLIF(TRIM(v_item->>'barcode'), '');
      v_category_id := NULLIF(v_item->>'category_id', '')::UUID;

      IF v_category_id IS NULL THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM public.categories c
        WHERE c.id = v_category_id
          AND c.store_id = v_store_id
          AND c.active = true
      ) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      v_product_id := NULL;

      IF v_internal_code IS NOT NULL THEN
        SELECT COUNT(*) INTO v_match_count
        FROM public.products p
        WHERE p.store_id = v_store_id
          AND p.active = true
          AND p.internal_code = v_internal_code;

        IF v_match_count = 1 THEN
          SELECT p.id INTO v_product_id
          FROM public.products p
          WHERE p.store_id = v_store_id
            AND p.active = true
            AND p.internal_code = v_internal_code
          LIMIT 1;
        ELSE
          v_skipped := v_skipped + 1;
          CONTINUE;
        END IF;
      ELSIF v_barcode IS NOT NULL
        AND v_barcode <> '0'
        AND v_barcode !~ '^0+$'
      THEN
        SELECT COUNT(*) INTO v_match_count
        FROM public.products p
        WHERE p.store_id = v_store_id
          AND p.active = true
          AND p.barcode = v_barcode;

        IF v_match_count = 1 THEN
          SELECT p.id INTO v_product_id
          FROM public.products p
          WHERE p.store_id = v_store_id
            AND p.active = true
            AND p.barcode = v_barcode
          LIMIT 1;
        ELSE
          v_skipped := v_skipped + 1;
          CONTINUE;
        END IF;
      ELSE
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      IF v_product_id IS NULL THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      UPDATE public.products
      SET category_id = v_category_id
      WHERE id = v_product_id
        AND store_id = v_store_id
        AND category_id IS NULL;

      IF FOUND THEN
        v_updated := v_updated + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'updated', v_updated,
    'skipped', v_skipped,
    'store_id', v_store_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_product_categories_batch(JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.backfill_product_categories_batch(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backfill_product_categories_batch(JSONB) FROM anon;
