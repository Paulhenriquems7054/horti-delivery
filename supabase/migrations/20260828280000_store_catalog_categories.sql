-- Categorias de catálogo multi-tenant (Beira Rio piloto) + suporte a category_id na importação

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 100;

CREATE INDEX IF NOT EXISTS idx_categories_store_sort
  ON public.categories (store_id, sort_order, name)
  WHERE active = true;

CREATE OR REPLACE FUNCTION public.ensure_store_catalog_categories()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
  v_defs JSONB := '[
    {"name":"Hortifrúti","sort_order":10,"description":"Frutas, verduras e legumes","icon":"🥬"},
    {"name":"Frios e Laticínios","sort_order":20,"description":"Leites, queijos, iogurtes e frios","icon":"🧀"},
    {"name":"Mercearia Seca e Básica","sort_order":30,"description":"Grãos, temperos, enlatados e secos","icon":"🛒"},
    {"name":"Bebidas","sort_order":40,"description":"Águas, refrigerantes, sucos e energéticos","icon":"🥤"},
    {"name":"Padaria e Confeitaria","sort_order":50,"description":"Pães, bolos e confeitaria","icon":"🥖"},
    {"name":"Limpeza","sort_order":60,"description":"Produtos de limpeza doméstica","icon":"🧹"},
    {"name":"Higiene Pessoal","sort_order":70,"description":"Higiene e cuidados pessoais","icon":"🧴"},
    {"name":"Utilidades e Outros","sort_order":80,"description":"Utilidades domésticas e itens diversos","icon":"🧰"},
    {"name":"Produtos Descartáveis","sort_order":90,"description":"Copos, pratos, filmes e sacos descartáveis","icon":"📦"}
  ]'::JSONB;
  v_item JSONB;
  v_created INTEGER := 0;
  v_existing INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_store_id := public.get_my_store_id();
  IF v_store_id IS NULL OR NOT public.is_store_owner(v_store_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_defs)
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.store_id = v_store_id
        AND lower(c.name) = lower(v_item->>'name')
    ) THEN
      UPDATE public.categories c
      SET
        sort_order = COALESCE((v_item->>'sort_order')::INTEGER, c.sort_order),
        description = COALESCE(v_item->>'description', c.description),
        icon = COALESCE(v_item->>'icon', c.icon),
        active = true
      WHERE c.store_id = v_store_id
        AND lower(c.name) = lower(v_item->>'name');
      v_existing := v_existing + 1;
    ELSE
      INSERT INTO public.categories (store_id, name, description, icon, active, sort_order)
      VALUES (
        v_store_id,
        v_item->>'name',
        v_item->>'description',
        v_item->>'icon',
        true,
        COALESCE((v_item->>'sort_order')::INTEGER, 100)
      );
      v_created := v_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'store_id', v_store_id,
    'created', v_created,
    'updated_existing', v_existing,
    'categories', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'sort_order', c.sort_order,
        'icon', c.icon
      ) ORDER BY c.sort_order, c.name), '[]'::JSONB)
      FROM public.categories c
      WHERE c.store_id = v_store_id AND c.active = true
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_store_catalog_categories() TO authenticated;
REVOKE ALL ON FUNCTION public.ensure_store_catalog_categories() FROM anon;

CREATE OR REPLACE FUNCTION public.set_product_category(
  p_product_id UUID,
  p_category_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
  v_product_store UUID;
  v_category_store UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_store_id := public.get_my_store_id();
  IF v_store_id IS NULL OR NOT public.is_store_owner(v_store_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT store_id INTO v_product_store
  FROM public.products
  WHERE id = p_product_id;

  IF v_product_store IS NULL THEN
    RAISE EXCEPTION 'product not found';
  END IF;

  IF v_product_store <> v_store_id THEN
    RAISE EXCEPTION 'product does not belong to store';
  END IF;

  IF p_category_id IS NOT NULL THEN
    SELECT store_id INTO v_category_store
    FROM public.categories
    WHERE id = p_category_id AND active = true;

    IF v_category_store IS NULL THEN
      RAISE EXCEPTION 'category not found';
    END IF;

    IF v_category_store <> v_store_id THEN
      RAISE EXCEPTION 'category does not belong to store';
    END IF;
  END IF;

  UPDATE public.products
  SET category_id = p_category_id
  WHERE id = p_product_id
    AND store_id = v_store_id;

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'category_id', p_category_id,
    'store_id', v_store_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_product_category(UUID, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.set_product_category(UUID, UUID) FROM anon;

CREATE OR REPLACE FUNCTION public.assign_product_categories_batch(
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
  v_product_id UUID;
  v_category_id UUID;
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
      v_product_id := (v_item->>'product_id')::UUID;
      v_category_id := NULLIF(v_item->>'category_id', '')::UUID;

      IF v_product_id IS NULL THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = v_product_id AND p.store_id = v_store_id
      ) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      IF v_category_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.categories c
        WHERE c.id = v_category_id
          AND c.store_id = v_store_id
          AND c.active = true
      ) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      UPDATE public.products
      SET category_id = v_category_id
      WHERE id = v_product_id
        AND store_id = v_store_id;

      v_updated := v_updated + 1;
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

GRANT EXECUTE ON FUNCTION public.assign_product_categories_batch(JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.assign_product_categories_batch(JSONB) FROM anon;

DO $$
DECLARE
  v_store_id UUID;
  v_defs JSONB := '[
    {"name":"Hortifrúti","sort_order":10,"description":"Frutas, verduras e legumes","icon":"🥬"},
    {"name":"Frios e Laticínios","sort_order":20,"description":"Leites, queijos, iogurtes e frios","icon":"🧀"},
    {"name":"Mercearia Seca e Básica","sort_order":30,"description":"Grãos, temperos, enlatados e secos","icon":"🛒"},
    {"name":"Bebidas","sort_order":40,"description":"Águas, refrigerantes, sucos e energéticos","icon":"🥤"},
    {"name":"Padaria e Confeitaria","sort_order":50,"description":"Pães, bolos e confeitaria","icon":"🥖"},
    {"name":"Limpeza","sort_order":60,"description":"Produtos de limpeza doméstica","icon":"🧹"},
    {"name":"Higiene Pessoal","sort_order":70,"description":"Higiene e cuidados pessoais","icon":"🧴"},
    {"name":"Utilidades e Outros","sort_order":80,"description":"Utilidades domésticas e itens diversos","icon":"🧰"},
    {"name":"Produtos Descartáveis","sort_order":90,"description":"Copos, pratos, filmes e sacos descartáveis","icon":"📦"}
  ]'::JSONB;
  v_item JSONB;
BEGIN
  SELECT id INTO v_store_id
  FROM public.stores
  WHERE slug = 'beira-rio'
  LIMIT 1;

  IF v_store_id IS NULL THEN
    RAISE NOTICE 'Loja beira-rio não encontrada — seed de categorias adiado.';
    RETURN;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_defs)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.store_id = v_store_id
        AND lower(c.name) = lower(v_item->>'name')
    ) THEN
      INSERT INTO public.categories (store_id, name, description, icon, active, sort_order)
      VALUES (
        v_store_id,
        v_item->>'name',
        v_item->>'description',
        v_item->>'icon',
        true,
        COALESCE((v_item->>'sort_order')::INTEGER, 100)
      );
    ELSE
      UPDATE public.categories c
      SET
        sort_order = COALESCE((v_item->>'sort_order')::INTEGER, c.sort_order),
        description = COALESCE(v_item->>'description', c.description),
        icon = COALESCE(v_item->>'icon', c.icon),
        active = true
      WHERE c.store_id = v_store_id
        AND lower(c.name) = lower(v_item->>'name');
    END IF;
  END LOOP;
END $$;

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
  v_category_id UUID;
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

GRANT EXECUTE ON FUNCTION public.import_product_batch(UUID, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.import_product_batch(UUID, JSONB) FROM anon;
