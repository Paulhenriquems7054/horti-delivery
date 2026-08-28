-- FASE 2–3–5: rate limits adicionais, RPCs restritas, LGPD (consentimento + retenção)

-- ---------- rate limit em rastreamento individual ----------
CREATE OR REPLACE FUNCTION public.get_order_for_customer(p_order_id UUID, p_phone TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone TEXT;
  v_order JSONB;
  v_allowed BOOLEAN;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_phone := public.normalize_phone(p_phone);
  IF length(v_phone) < 10 THEN
    RETURN NULL;
  END IF;

  SELECT public.check_rate_limit(
    'order_track:' || p_order_id::text || ':' || v_phone,
    'track',
    20,
    15
  ) INTO v_allowed;

  IF v_allowed IS FALSE THEN
    RAISE EXCEPTION 'rate limited';
  END IF;

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

-- ---------- restringe RPCs de plano ----------
CREATE OR REPLACE FUNCTION public.store_active_access_user_count(p_store_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (public.is_store_owner(p_store_id) OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN (
    SELECT CASE WHEN s.user_id IS NULL THEN 0 ELSE 1 END
    FROM public.stores s
    WHERE s.id = p_store_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.store_plan_user_limit(p_store_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (public.is_store_owner(p_store_id) OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(p.max_users, 1) INTO v_limit
  FROM public.stores s
  LEFT JOIN public.subscription_plans p ON p.code = s.subscription_plan
  WHERE s.id = p_store_id;

  RETURN COALESCE(v_limit, 1);
END;
$$;

-- ---------- LGPD: registro de consentimento no pedido ----------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS privacy_acknowledged_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.privacy_acknowledged_at IS
  'Momento em que o cliente confirmou ciência do tratamento de dados para este pedido.';

DROP FUNCTION IF EXISTS public.create_customer_order(
  TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, UUID, TEXT, TEXT, TEXT
);

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
  p_email TEXT DEFAULT NULL,
  p_privacy_acknowledged BOOLEAN DEFAULT false
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

  IF COALESCE(p_privacy_acknowledged, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'privacy acknowledgment required';
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
    delivery_zone_id, coupon_id, delivery_fee, discount, notes, email, payment_method,
    privacy_acknowledged_at
  ) VALUES (
    trim(p_customer_name), v_phone, p_address, 'pending', v_total, v_store.id,
    p_delivery_zone_id, v_coupon.id, v_fee, v_discount, p_notes, p_email,
    v_pay, now()
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

GRANT EXECUTE ON FUNCTION public.create_customer_order(
  TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, UUID, TEXT, TEXT, TEXT, BOOLEAN
) TO anon, authenticated;

-- ---------- LGPD: anonimização de pedidos entregues antigos (platform admin) ----------
CREATE OR REPLACE FUNCTION public.anonymize_old_delivered_orders(p_older_than_days INTEGER DEFAULT 365)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM public.assert_platform_admin();

  IF p_older_than_days IS NULL OR p_older_than_days < 30 THEN
    RAISE EXCEPTION 'invalid retention period';
  END IF;

  WITH updated AS (
    UPDATE public.orders
    SET
      customer_name = 'Anonimizado',
      phone = '0000000000',
      address = 'Removido',
      email = NULL,
      notes = NULL
    WHERE status = 'delivered'
      AND created_at < now() - (p_older_than_days || ' days')::INTERVAL
      AND customer_name IS DISTINCT FROM 'Anonimizado'
    RETURNING id
  )
  SELECT COUNT(*)::INTEGER INTO v_count FROM updated;

  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.anonymize_old_delivered_orders(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anonymize_old_delivered_orders(INTEGER) TO authenticated;
