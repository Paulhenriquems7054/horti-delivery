-- ============================================================
-- HortiDelivery — Isolamento multi-tenant
-- Autoridade: Postgres (RLS + RPC). store_id do cliente não é prova.
-- Sem USING (true) / WITH CHECK (true) em tabelas privadas.
-- ============================================================

-- ---------- helpers ----------
CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.is_store_owner(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = p_store_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.prevent_store_id_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.store_id IS DISTINCT FROM OLD.store_id THEN
    RAISE EXCEPTION 'store_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products', 'baskets', 'basket_items', 'orders', 'order_items',
    'order_tracking', 'delivery_zones', 'coupons', 'categories',
    'favorites', 'direct_deliveries'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t)
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='store_id')
    THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_immutable_store_id ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_immutable_store_id BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.prevent_store_id_change()', t);
    END IF;
  END LOOP;
END $$;

-- ---------- stores_public ----------
CREATE OR REPLACE VIEW public.stores_public AS
  SELECT id, name, slug, description, logo_url, phone, email, address,
         active, subscription_status, created_at
  FROM public.stores
  WHERE active = true;

GRANT SELECT ON public.stores_public TO anon, authenticated;

-- ---------- drop old policies (known names) ----------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'stores','products','baskets','basket_items','orders','order_items',
        'order_tracking','delivery_zones','coupons','categories','favorites',
        'direct_deliveries','subscription_events','rate_limits','audit_logs',
        'weighing_history','default_products'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ---------- STORES ----------
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY stores_owner_select ON public.stores
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY stores_owner_insert ON public.stores
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY stores_owner_update ON public.stores
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY stores_owner_delete ON public.stores
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.stores FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;

-- ---------- PRODUCTS (catálogo ativo é público; escrita só dono) ----------
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY products_public_read ON public.products
  FOR SELECT
  USING (active = true AND store_id IS NOT NULL);

CREATE POLICY products_owner_read ON public.products
  FOR SELECT TO authenticated
  USING (public.is_store_owner(store_id));

CREATE POLICY products_owner_insert ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (store_id IS NOT NULL AND public.is_store_owner(store_id));

CREATE POLICY products_owner_update ON public.products
  FOR UPDATE TO authenticated
  USING (public.is_store_owner(store_id))
  WITH CHECK (public.is_store_owner(store_id));

CREATE POLICY products_owner_delete ON public.products
  FOR DELETE TO authenticated
  USING (store_id IS NOT NULL AND public.is_store_owner(store_id));

-- ---------- BASKETS ----------
ALTER TABLE public.baskets ENABLE ROW LEVEL SECURITY;

CREATE POLICY baskets_public_read ON public.baskets
  FOR SELECT
  USING (active = true AND store_id IS NOT NULL);

CREATE POLICY baskets_owner_all ON public.baskets
  FOR ALL TO authenticated
  USING (public.is_store_owner(store_id))
  WITH CHECK (store_id IS NOT NULL AND public.is_store_owner(store_id));

-- ---------- BASKET_ITEMS ----------
ALTER TABLE public.basket_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY basket_items_public_read ON public.basket_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.baskets b
      WHERE b.id = basket_id AND b.active = true AND b.store_id IS NOT NULL
    )
  );

CREATE POLICY basket_items_owner_all ON public.basket_items
  FOR ALL TO authenticated
  USING (store_id IS NOT NULL AND public.is_store_owner(store_id))
  WITH CHECK (store_id IS NOT NULL AND public.is_store_owner(store_id));

-- ---------- CATEGORIES ----------
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY categories_public_read ON public.categories
  FOR SELECT
  USING (active = true AND store_id IS NOT NULL);

CREATE POLICY categories_owner_all ON public.categories
  FOR ALL TO authenticated
  USING (public.is_store_owner(store_id))
  WITH CHECK (store_id IS NOT NULL AND public.is_store_owner(store_id));

-- ---------- DELIVERY ZONES (taxa pública da loja ativa) ----------
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY zones_public_read ON public.delivery_zones
  FOR SELECT
  USING (
    active = true AND store_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.active = true)
  );

CREATE POLICY zones_owner_all ON public.delivery_zones
  FOR ALL TO authenticated
  USING (public.is_store_owner(store_id))
  WITH CHECK (store_id IS NOT NULL AND public.is_store_owner(store_id));

-- ---------- COUPONS (sem listagem pública) ----------
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY coupons_owner_all ON public.coupons
  FOR ALL TO authenticated
  USING (store_id IS NOT NULL AND public.is_store_owner(store_id))
  WITH CHECK (store_id IS NOT NULL AND public.is_store_owner(store_id));

REVOKE ALL ON public.coupons FROM anon;

-- ---------- ORDERS (privado) ----------
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_owner_select ON public.orders
  FOR SELECT TO authenticated
  USING (public.is_store_owner(store_id));

CREATE POLICY orders_owner_update ON public.orders
  FOR UPDATE TO authenticated
  USING (public.is_store_owner(store_id))
  WITH CHECK (public.is_store_owner(store_id));

REVOKE ALL ON public.orders FROM anon;
GRANT SELECT, UPDATE ON public.orders TO authenticated;

-- ---------- ORDER_ITEMS ----------
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_items_owner_select ON public.order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND public.is_store_owner(o.store_id)
    )
  );

CREATE POLICY order_items_owner_update ON public.order_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND public.is_store_owner(o.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND public.is_store_owner(o.store_id)
    )
  );

REVOKE ALL ON public.order_items FROM anon;
GRANT SELECT, UPDATE ON public.order_items TO authenticated;

-- ---------- ORDER_TRACKING ----------
ALTER TABLE public.order_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_tracking_owner_select ON public.order_tracking
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND public.is_store_owner(o.store_id)
    )
  );

CREATE POLICY order_tracking_owner_insert ON public.order_tracking
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND public.is_store_owner(o.store_id)
    )
  );

REVOKE ALL ON public.order_tracking FROM anon;
GRANT SELECT, INSERT ON public.order_tracking TO authenticated;

-- ---------- FAVORITES ----------
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY favorites_owner_all ON public.favorites
  FOR ALL TO authenticated
  USING (store_id IS NOT NULL AND public.is_store_owner(store_id))
  WITH CHECK (store_id IS NOT NULL AND public.is_store_owner(store_id));

REVOKE ALL ON public.favorites FROM anon;

-- ---------- DIRECT_DELIVERIES ----------
ALTER TABLE public.direct_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY direct_deliveries_owner_all ON public.direct_deliveries
  FOR ALL TO authenticated
  USING (public.is_store_owner(store_id))
  WITH CHECK (store_id IS NOT NULL AND public.is_store_owner(store_id));

REVOKE ALL ON public.direct_deliveries FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.direct_deliveries TO authenticated;

-- ---------- SUBSCRIPTION_EVENTS ----------
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscription_events_owner_select ON public.subscription_events
  FOR SELECT TO authenticated
  USING (public.is_store_owner(store_id));

REVOKE ALL ON public.subscription_events FROM anon;

-- ---------- RATE_LIMITS ----------
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM anon, authenticated;

-- ---------- AUDIT_LOGS ----------
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_owner_select ON public.audit_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_store_owner(store_id));

REVOKE ALL ON public.audit_logs FROM anon;
GRANT SELECT ON public.audit_logs TO authenticated;

-- ---------- WEIGHING_HISTORY ----------
ALTER TABLE public.weighing_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY weighing_history_owner_select ON public.weighing_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND public.is_store_owner(o.store_id)
    )
  );

CREATE POLICY weighing_history_owner_insert ON public.weighing_history
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND public.is_store_owner(o.store_id)
    )
  );

REVOKE ALL ON public.weighing_history FROM anon;

-- ---------- DEFAULT_PRODUCTS (template global) ----------
ALTER TABLE public.default_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY default_products_read ON public.default_products
  FOR SELECT
  USING (active = true);

-- ============================================================
-- RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_store_id UUID,
  p_action TEXT,
  p_metadata JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_store_id IS NOT NULL AND NOT public.is_store_owner(p_store_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  INSERT INTO public.audit_logs (store_id, user_id, action, metadata)
  VALUES (p_store_id, auth.uid(), p_action, p_metadata);
END;
$$;

CREATE OR REPLACE FUNCTION public.copy_default_catalog(p_store_id UUID, p_basket_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_product_id UUID;
  dp RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.is_store_owner(p_store_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.baskets WHERE id = p_basket_id AND store_id = p_store_id
  ) THEN
    RAISE EXCEPTION 'basket does not belong to store';
  END IF;

  FOR dp IN SELECT * FROM public.default_products WHERE active = true LOOP
    INSERT INTO public.products (name, price, image_url, unit, active, store_id)
    VALUES (dp.name, dp.price, dp.image_url, dp.unit, true, p_store_id)
    RETURNING id INTO new_product_id;

    INSERT INTO public.basket_items (basket_id, product_id, quantity, store_id)
    VALUES (p_basket_id, new_product_id, 1, p_store_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_order_total(p_order_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store UUID;
  v_total NUMERIC;
BEGIN
  SELECT store_id INTO v_store FROM public.orders WHERE id = p_order_id;
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'order not found';
  END IF;
  IF auth.uid() IS NULL OR NOT public.is_store_owner(v_store) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(SUM(COALESCE(final_price, estimated_price, price * COALESCE(quantity, 1), 0)), 0)
    INTO v_total
  FROM public.order_items
  WHERE order_id = p_order_id;

  SELECT v_total + COALESCE(delivery_fee, 0) - COALESCE(discount, 0)
    INTO v_total
  FROM public.orders
  WHERE id = p_order_id;

  IF v_total < 0 THEN v_total := 0; END IF;

  UPDATE public.orders SET total = v_total WHERE id = p_order_id;
  RETURN v_total;
END;
$$;

-- increment_coupon_usage: apenas interno (revoke public)
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(coupon_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.coupons
  SET used_count = used_count + 1
  WHERE id = coupon_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_coupon(
  p_store_slug TEXT,
  p_code TEXT,
  p_subtotal NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store UUID;
  v_coupon public.coupons%ROWTYPE;
  v_discount NUMERIC := 0;
BEGIN
  SELECT id INTO v_store FROM public.stores WHERE slug = p_store_slug AND active = true;
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'store not found';
  END IF;

  SELECT * INTO v_coupon
  FROM public.coupons
  WHERE store_id = v_store
    AND upper(code) = upper(p_code)
    AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid coupon';
  END IF;
  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
    RAISE EXCEPTION 'coupon expired';
  END IF;
  IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN
    RAISE EXCEPTION 'coupon exhausted';
  END IF;
  IF COALESCE(v_coupon.min_order, 0) > COALESCE(p_subtotal, 0) THEN
    RAISE EXCEPTION 'minimum order not met';
  END IF;

  IF v_coupon.discount_type = 'percentage' THEN
    v_discount := ROUND(COALESCE(p_subtotal, 0) * v_coupon.discount_value / 100, 2);
  ELSE
    v_discount := v_coupon.discount_value;
  END IF;

  RETURN jsonb_build_object(
    'id', v_coupon.id,
    'code', v_coupon.code,
    'discount_type', v_coupon.discount_type,
    'discount_value', v_coupon.discount_value,
    'discount', v_discount
  );
END;
$$;

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
BEGIN
  IF p_store_slug IS NULL OR length(trim(p_customer_name)) < 2 THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  v_phone := public.normalize_phone(p_phone);
  IF length(v_phone) < 10 THEN
    RAISE EXCEPTION 'invalid phone';
  END IF;

  SELECT public.check_rate_limit(v_phone, 'order', 10, 60) INTO v_allowed;
  IF v_allowed IS FALSE THEN
    RAISE EXCEPTION 'rate limited';
  END IF;

  SELECT * INTO v_store FROM public.stores WHERE slug = p_store_slug AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'store not found';
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
    COALESCE(p_payment_method, 'cash')
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
    'store_id', v_store.id
  );
END;
$$;

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
  SELECT to_jsonb(o) INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id AND public.normalize_phone(o.phone) = v_phone;
  IF v_order IS NULL THEN
    RETURN NULL;
  END IF;
  v_order := v_order || jsonb_build_object(
    'order_items', COALESCE((
      SELECT jsonb_agg(to_jsonb(i) || jsonb_build_object('product_name', i.product_name))
      FROM public.order_items i WHERE i.order_id = p_order_id
    ), '[]'::jsonb)
  );
  RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_orders_by_phone(p_phone TEXT, p_store_slug TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone TEXT;
  v_store UUID;
BEGIN
  v_phone := public.normalize_phone(p_phone);
  IF p_store_slug IS NOT NULL THEN
    SELECT id INTO v_store FROM public.stores WHERE slug = p_store_slug AND active = true;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(o) ORDER BY o.created_at DESC)
    FROM public.orders o
    WHERE public.normalize_phone(o.phone) = v_phone
      AND (v_store IS NULL OR o.store_id = v_store)
  ), '[]'::jsonb);
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
  v_ok BOOLEAN;
BEGIN
  SELECT * INTO v_store FROM public.stores WHERE slug = p_store_slug AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'store not found';
  END IF;
  v_ok := (v_store.delivery_pin IS NOT NULL AND v_store.delivery_pin = p_pin);
  IF NOT v_ok THEN
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
  SELECT * INTO v_store FROM public.stores WHERE slug = p_store_slug AND active = true;
  IF NOT FOUND OR v_store.delivery_pin IS DISTINCT FROM p_pin THEN
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
  SELECT * INTO v_store FROM public.stores WHERE slug = p_store_slug AND active = true;
  IF NOT FOUND OR v_store.delivery_pin IS DISTINCT FROM p_pin THEN
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

CREATE OR REPLACE FUNCTION public.get_direct_deliveries_by_phone(p_phone TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone TEXT;
BEGIN
  v_phone := public.normalize_phone(p_phone);
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC)
    FROM public.direct_deliveries d
    WHERE public.normalize_phone(d.phone) = v_phone
    LIMIT 5
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_direct_delivery_fee(
  p_id UUID,
  p_phone TEXT,
  p_approved BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone TEXT;
BEGIN
  v_phone := public.normalize_phone(p_phone);
  UPDATE public.direct_deliveries
  SET
    status = CASE WHEN p_approved THEN 'approved' ELSE 'cancelled' END,
    approved_at = CASE WHEN p_approved THEN now() ELSE approved_at END
  WHERE id = p_id
    AND public.normalize_phone(phone) = v_phone
    AND status = 'awaiting_approval';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
END;
$$;

-- ---------- grants ----------
REVOKE ALL ON FUNCTION public.increment_coupon_usage(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.copy_default_catalog(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_order_total(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit_event(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_coupon(TEXT, TEXT, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_order(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, UUID, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_for_customer(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_orders_by_phone(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_delivery_pin(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_delivery_orders(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_delivery_order_status(TEXT, TEXT, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_direct_deliveries_by_phone(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_direct_delivery_fee(UUID, TEXT, BOOLEAN) TO anon, authenticated;

-- ---------- storage: receipts private to authenticated (uploaders/owners) ----------
DROP POLICY IF EXISTS "Anyone can view receipt photos" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete their receipt photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view product images" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete product images" ON storage.objects;

CREATE POLICY receipts_authenticated_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'order-receipts');

CREATE POLICY receipts_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'order-receipts' AND owner = auth.uid());

CREATE POLICY product_images_public_select ON storage.objects
  FOR SELECT
  USING (bucket_id = 'arquivos');

CREATE POLICY product_images_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'arquivos' AND owner = auth.uid());
