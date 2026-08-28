-- FASE 1 — Correções BLOCKER (SEC-C01, H01/H07, H02, H03, H04)
-- Reaplica proteção de pedido duplicado de 20260827180000 (pg_advisory_xact_lock).
-- Verificação no Hosted:
--   SELECT prosrc LIKE '%pg_advisory_xact_lock%' FROM pg_proc WHERE proname = 'create_customer_order';

-- pgcrypto no Supabase Hosted fica no schema extensions (não public).
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================
-- SEC-C01 — Remove policies legadas permissivas
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        policyname LIKE 'Anyone can%'
        OR policyname IN (
          'orders_public_insert', 'orders_public_read', 'orders_owner_read',
          'order_items_public_insert', 'order_items_owner_read',
          'order_tracking_public_read', 'order_tracking_insert',
          'stores_public_read', 'stores_auth_insert',
          'Customer can view their receipt photo',
          'Admin can upload receipt photos',
          'rate_limits_public'
        )
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Customer can view their receipt photo" ON public.orders;
DROP POLICY IF EXISTS "Admin can upload receipt photos" ON public.orders;

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.rate_limits FROM anon, authenticated;

-- Garante policies owner-only em orders (se ausentes após limpeza legada)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'orders_owner_select'
  ) THEN
    CREATE POLICY orders_owner_select ON public.orders
      FOR SELECT TO authenticated
      USING (public.is_store_owner(store_id));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'orders_owner_update'
  ) THEN
    CREATE POLICY orders_owner_update ON public.orders
      FOR UPDATE TO authenticated
      USING (public.is_store_owner(store_id))
      WITH CHECK (public.is_store_owner(store_id));
  END IF;
END $$;

-- ============================================================
-- SEC-H03 — Bloqueia auto-provisionamento de lojas
-- ============================================================
DROP POLICY IF EXISTS stores_owner_insert ON public.stores;
REVOKE INSERT ON public.stores FROM authenticated;
GRANT SELECT, UPDATE, DELETE ON public.stores TO authenticated;

-- ============================================================
-- SEC-H02 — PIN do entregador com hash + rate limit
-- ============================================================
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS delivery_pin_hash TEXT;

-- Migração condicional: delivery_pin pode já ter sido removida em execução parcial.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores' AND column_name = 'delivery_pin'
  ) THEN
    EXECUTE $sql$
      UPDATE public.stores
      SET delivery_pin_hash = extensions.crypt(
        COALESCE(NULLIF(trim(delivery_pin), ''), '1234'),
        extensions.gen_salt('bf', 8)
      )
      WHERE delivery_pin_hash IS NULL
    $sql$;
  END IF;
END $$;

-- Lojas sem hash (coluna antiga já removida): hash temporário do PIN legado 1234.
-- O lojista deve definir PIN novo (6–8 dígitos) no painel admin.
UPDATE public.stores
SET delivery_pin_hash = extensions.crypt('1234', extensions.gen_salt('bf', 8))
WHERE delivery_pin_hash IS NULL;

ALTER TABLE public.stores DROP COLUMN IF EXISTS delivery_pin;

CREATE OR REPLACE FUNCTION public.delivery_pin_matches(p_hash TEXT, p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  SELECT p_hash IS NOT NULL
    AND p_pin IS NOT NULL
    AND length(trim(p_pin)) >= 4
    AND extensions.crypt(trim(p_pin), p_hash) = p_hash;
$$;

CREATE OR REPLACE FUNCTION public.update_store_delivery_pin(p_pin TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_pin TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_pin := trim(COALESCE(p_pin, ''));
  IF length(v_pin) < 6 OR length(v_pin) > 8 OR v_pin !~ '^\d+$' THEN
    RAISE EXCEPTION 'invalid pin';
  END IF;

  UPDATE public.stores
  SET delivery_pin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf', 8))
  WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'store not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_delivery_pin(p_store_slug TEXT, p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store public.stores%ROWTYPE;
  v_allowed BOOLEAN;
BEGIN
  IF p_store_slug IS NULL OR length(trim(p_store_slug)) = 0 THEN
    RAISE EXCEPTION 'invalid store';
  END IF;

  SELECT public.check_rate_limit('delivery_pin:' || lower(trim(p_store_slug)), 'delivery_pin', 10, 15)
    INTO v_allowed;
  IF v_allowed IS FALSE THEN
    RAISE EXCEPTION 'rate limited';
  END IF;

  SELECT * INTO v_store FROM public.stores WHERE slug = lower(trim(p_store_slug)) AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'store not found';
  END IF;

  IF NOT public.delivery_pin_matches(v_store.delivery_pin_hash, p_pin) THEN
    RAISE EXCEPTION 'invalid pin';
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_store.id, 'name', v_store.name, 'slug', v_store.slug);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_delivery_orders(p_store_slug TEXT, p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store public.stores%ROWTYPE;
BEGIN
  SELECT * INTO v_store FROM public.stores WHERE slug = lower(trim(p_store_slug)) AND active = true;
  IF NOT FOUND OR NOT public.delivery_pin_matches(v_store.delivery_pin_hash, p_pin) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(o) ORDER BY o.created_at)
    FROM public.orders o
    WHERE o.store_id = v_store.id
      AND o.status IN ('ready_for_delivery', 'delivering')
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_delivery_order_status(
  p_store_slug TEXT,
  p_pin TEXT,
  p_order_id UUID,
  p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store public.stores%ROWTYPE;
BEGIN
  IF p_status NOT IN ('delivering', 'delivered') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  SELECT * INTO v_store FROM public.stores WHERE slug = lower(trim(p_store_slug)) AND active = true;
  IF NOT FOUND OR NOT public.delivery_pin_matches(v_store.delivery_pin_hash, p_pin) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE public.orders
  SET status = p_status
  WHERE id = p_order_id AND store_id = v_store.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found';
  END IF;

  INSERT INTO public.order_tracking (order_id, status, notes, store_id)
  VALUES (p_order_id, p_status, 'Atualizado pelo entregador', v_store.id);
END;
$$;

REVOKE ALL ON FUNCTION public.update_store_delivery_pin(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_store_delivery_pin(TEXT) TO authenticated;

-- ============================================================
-- SEC-H01/H07 — Rastreamento isolado por loja + rate limit
-- ============================================================
DROP FUNCTION IF EXISTS public.get_orders_by_phone(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.get_orders_by_phone(
  p_phone TEXT,
  p_store_slug TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone TEXT;
  v_store UUID;
  v_allowed BOOLEAN;
BEGIN
  v_phone := public.normalize_phone(p_phone);
  IF length(v_phone) < 10 THEN
    RAISE EXCEPTION 'invalid phone';
  END IF;

  IF p_store_slug IS NULL OR length(trim(p_store_slug)) = 0 THEN
    RAISE EXCEPTION 'store slug required';
  END IF;

  SELECT id INTO v_store
  FROM public.stores
  WHERE slug = lower(trim(p_store_slug)) AND active = true;

  IF v_store IS NULL THEN
    RAISE EXCEPTION 'store not found';
  END IF;

  SELECT public.check_rate_limit(
    'track:' || lower(trim(p_store_slug)) || ':' || v_phone,
    'track',
    10,
    15
  ) INTO v_allowed;

  IF v_allowed IS FALSE THEN
    RAISE EXCEPTION 'rate limited';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'customer_name', o.customer_name,
        'phone', o.phone,
        'address', o.address,
        'status', o.status,
        'total', o.total,
        'created_at', o.created_at,
        'notes', o.notes,
        'payment_method', o.payment_method,
        'store_id', o.store_id
      )
      ORDER BY o.created_at DESC
    )
    FROM public.orders o
    WHERE public.normalize_phone(o.phone) = v_phone
      AND o.store_id = v_store
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_orders_by_phone(TEXT, TEXT) TO anon, authenticated;

-- Não expõe URL/path do cupom fiscal ao cliente anônimo
CREATE OR REPLACE FUNCTION public.get_order_for_customer(p_order_id UUID, p_phone TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone TEXT;
  v_order JSONB;
BEGIN
  v_phone := public.normalize_phone(p_phone);

  SELECT to_jsonb(o) - 'receipt_photo_url' INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id AND public.normalize_phone(o.phone) = v_phone;

  IF v_order IS NULL THEN
    RETURN NULL;
  END IF;

  v_order := v_order || jsonb_build_object(
    'has_receipt', EXISTS (
      SELECT 1 FROM public.orders o2
      WHERE o2.id = p_order_id AND o2.receipt_photo_url IS NOT NULL
    ),
    'order_items', COALESCE((
      SELECT jsonb_agg(to_jsonb(i) || jsonb_build_object('product_name', i.product_name))
      FROM public.order_items i WHERE i.order_id = p_order_id
    ), '[]'::jsonb)
  );

  RETURN v_order;
END;
$$;

-- ============================================================
-- Pedido duplicado + PIX (reconfirma 20260827180000)
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_customer_order(
  p_store_slug TEXT,
  p_customer_name TEXT,
  p_phone TEXT,
  p_address TEXT,
  p_items JSONB,
  p_coupon_code TEXT DEFAULT NULL,
  p_delivery_zone_id UUID DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'cash',
  p_notes TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store public.stores%ROWTYPE;
  v_item JSONB;
  v_product public.products%ROWTYPE;
  v_qty NUMERIC;
  p_sold TEXT;
  v_weight NUMERIC;
  v_line NUMERIC;
  v_subtotal NUMERIC := 0;
  v_discount NUMERIC := 0;
  v_fee NUMERIC := 0;
  v_total NUMERIC;
  v_coupon public.coupons%ROWTYPE;
  v_zone public.delivery_zones%ROWTYPE;
  v_order_id UUID;
  v_phone TEXT;
  v_allowed BOOLEAN;
  v_pay TEXT;
BEGIN
  IF p_store_slug IS NULL OR length(trim(p_customer_name)) < 2 THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  v_phone := public.normalize_phone(p_phone);
  IF length(v_phone) < 10 THEN
    RAISE EXCEPTION 'invalid phone';
  END IF;

  v_pay := lower(trim(COALESCE(p_payment_method, 'cash')));
  IF v_pay = 'card' THEN v_pay := 'credit'; END IF;
  IF v_pay NOT IN ('credit', 'debit', 'cash', 'pix') THEN
    RAISE EXCEPTION 'invalid payment method';
  END IF;

  SELECT public.check_rate_limit(v_phone, 'order', 10, 60) INTO v_allowed;
  IF v_allowed IS FALSE THEN
    RAISE EXCEPTION 'rate limited';
  END IF;

  SELECT * INTO v_store FROM public.stores WHERE slug = p_store_slug AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'store not found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_store.id::text), hashtext(v_phone));

  IF EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.store_id = v_store.id
      AND public.normalize_phone(o.phone) = v_phone
      AND o.status IN ('pending', 'preparing', 'ready_for_delivery', 'delivering')
  ) THEN
    RAISE EXCEPTION 'active order exists';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 THEN
    RAISE EXCEPTION 'empty cart';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::UUID
      AND store_id = v_store.id
      AND active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid product';
    END IF;

    p_sold := COALESCE(v_item->>'sold_by', 'unit');
    IF p_sold = 'weight' THEN
      v_weight := COALESCE((v_item->>'weight_kg')::NUMERIC, 0);
      IF v_weight <= 0 THEN RAISE EXCEPTION 'invalid weight'; END IF;
      v_line := ROUND(COALESCE(v_product.price_per_kg, v_product.price) * v_weight, 2);
    ELSE
      v_qty := COALESCE((v_item->>'quantity')::NUMERIC, 1);
      IF v_qty <= 0 THEN RAISE EXCEPTION 'invalid quantity'; END IF;
      v_line := ROUND(COALESCE(v_product.price_per_unit, v_product.price) * v_qty, 2);
    END IF;
    v_subtotal := v_subtotal + v_line;
  END LOOP;

  IF p_delivery_zone_id IS NOT NULL THEN
    SELECT * INTO v_zone
    FROM public.delivery_zones
    WHERE id = p_delivery_zone_id AND store_id = v_store.id AND active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid delivery zone';
    END IF;
    IF COALESCE(v_zone.min_order, 0) > v_subtotal THEN
      RAISE EXCEPTION 'minimum order not met';
    END IF;
    v_fee := COALESCE(v_zone.fee, 0);
  END IF;

  IF p_coupon_code IS NOT NULL AND length(trim(p_coupon_code)) > 0 THEN
    SELECT * INTO v_coupon
    FROM public.coupons
    WHERE store_id = v_store.id AND upper(code) = upper(trim(p_coupon_code)) AND active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'invalid coupon'; END IF;
    IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
      RAISE EXCEPTION 'coupon expired';
    END IF;
    IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN
      RAISE EXCEPTION 'coupon exhausted';
    END IF;
    IF COALESCE(v_coupon.min_order, 0) > v_subtotal THEN
      RAISE EXCEPTION 'minimum order not met';
    END IF;
    IF v_coupon.discount_type = 'percentage' THEN
      v_discount := ROUND(v_subtotal * v_coupon.discount_value / 100, 2);
    ELSE
      v_discount := v_coupon.discount_value;
    END IF;
  END IF;

  v_total := v_subtotal - v_discount + v_fee;
  IF v_total < 0 THEN v_total := 0; END IF;

  INSERT INTO public.orders (
    customer_name, phone, address, status, total, store_id,
    delivery_zone_id, coupon_id, delivery_fee, discount, notes, email, payment_method
  ) VALUES (
    trim(p_customer_name), v_phone, p_address, 'pending', v_total, v_store.id,
    p_delivery_zone_id, v_coupon.id, v_fee, v_discount, p_notes, p_email,
    v_pay
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::UUID;
    p_sold := COALESCE(v_item->>'sold_by', 'unit');
    IF p_sold = 'weight' THEN
      v_weight := (v_item->>'weight_kg')::NUMERIC;
      v_line := ROUND(COALESCE(v_product.price_per_kg, v_product.price) * v_weight, 2);
      INSERT INTO public.order_items (
        order_id, product_id, quantity, price, weight_kg, sold_by, needs_weighing, store_id, product_name
      ) VALUES (
        v_order_id, v_product.id, 1, v_line, v_weight, 'weight', false, v_store.id, v_product.name
      );
    ELSE
      v_qty := COALESCE((v_item->>'quantity')::NUMERIC, 1);
      v_line := ROUND(COALESCE(v_product.price_per_unit, v_product.price) * v_qty, 2);
      INSERT INTO public.order_items (
        order_id, product_id, quantity, price, sold_by, needs_weighing, store_id, product_name
      ) VALUES (
        v_order_id, v_product.id, v_qty, v_line, 'unit', true, v_store.id, v_product.name
      );
    END IF;
  END LOOP;

  IF v_coupon.id IS NOT NULL THEN
    PERFORM public.increment_coupon_usage(v_coupon.id);
  END IF;

  INSERT INTO public.order_tracking (order_id, status, notes, store_id)
  VALUES (v_order_id, 'pending', 'Pedido recebido', v_store.id);

  RETURN jsonb_build_object(
    'id', v_order_id,
    'total', v_total,
    'discount', v_discount,
    'delivery_fee', v_fee,
    'store_id', v_store.id,
    'payment_method', v_pay
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_customer_order(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, UUID, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ============================================================
-- SEC-H04 — Cupons fiscais: bucket privado + policies por loja
-- ============================================================
UPDATE storage.buckets SET public = false WHERE id = 'order-receipts';

DROP POLICY IF EXISTS "Anyone can view receipt photos" ON storage.objects;
DROP POLICY IF EXISTS "Admin can upload receipt photos" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete their receipt photos" ON storage.objects;
DROP POLICY IF EXISTS receipts_authenticated_select ON storage.objects;
DROP POLICY IF EXISTS receipts_owner_insert ON storage.objects;
DROP POLICY IF EXISTS receipts_owner_select ON storage.objects;
DROP POLICY IF EXISTS receipts_owner_delete ON storage.objects;

CREATE POLICY receipts_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'order-receipts'
    AND (storage.foldername(name))[1] = 'receipts'
    AND public.is_store_owner(((storage.foldername(name))[2])::uuid)
  );

CREATE POLICY receipts_owner_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'order-receipts'
    AND (storage.foldername(name))[1] = 'receipts'
    AND public.is_store_owner(((storage.foldername(name))[2])::uuid)
  );

CREATE POLICY receipts_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'order-receipts'
    AND (storage.foldername(name))[1] = 'receipts'
    AND public.is_store_owner(((storage.foldername(name))[2])::uuid)
  );

COMMENT ON COLUMN public.orders.receipt_photo_url IS 'Storage path (privado) ex: receipts/{store_id}/receipt_{order_id}_{ts}.jpg';
