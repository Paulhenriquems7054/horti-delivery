-- Beira Rio: observação por item, config operacional por loja, fila de impressão

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------- observação por linha do pedido ----------
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS item_notes TEXT;

COMMENT ON COLUMN public.order_items.item_notes IS
  'Observação opcional do cliente para esta linha específica do pedido.';

-- ---------- configuração operacional por loja ----------
CREATE TABLE IF NOT EXISTS public.store_operational_settings (
  store_id UUID PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'America/Aracaju',
  delivery_weekdays SMALLINT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6],
  delivery_start_time TIME NOT NULL DEFAULT '08:00',
  delivery_end_time TIME NOT NULL DEFAULT '17:00',
  return_policy_text TEXT,
  delivery_hours_message TEXT,
  outside_hours_message TEXT,
  auto_print_enabled BOOLEAN NOT NULL DEFAULT false,
  print_store_name TEXT,
  print_agent_token_hash TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.store_operational_settings IS
  'Configurações operacionais por loja (horário, políticas, impressão).';

ALTER TABLE public.store_operational_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_ops_public_read ON public.store_operational_settings;
CREATE POLICY store_ops_public_read ON public.store_operational_settings
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS store_ops_owner_write ON public.store_operational_settings;
CREATE POLICY store_ops_owner_write ON public.store_operational_settings
  FOR ALL TO authenticated
  USING (public.is_store_owner(store_id) OR public.is_platform_admin())
  WITH CHECK (public.is_store_owner(store_id) OR public.is_platform_admin());

-- ---------- fila de impressão ----------
CREATE TABLE IF NOT EXISTS public.print_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'printed', 'failed', 'cancelled')),
  idempotency_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_reprint BOOLEAN NOT NULL DEFAULT false,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  printed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  requested_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_print_jobs_store_status
  ON public.print_jobs(store_id, status, requested_at);

ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS print_jobs_owner_read ON public.print_jobs;
CREATE POLICY print_jobs_owner_read ON public.print_jobs
  FOR SELECT TO authenticated
  USING (public.is_store_owner(store_id) OR public.is_platform_admin());

-- ---------- helpers de impressão ----------
CREATE OR REPLACE FUNCTION public._build_order_receipt_payload(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_store public.stores%ROWTYPE;
  v_ops public.store_operational_settings%ROWTYPE;
  v_items JSONB;
  v_receipt TEXT;
  v_line TEXT;
  v_item RECORD;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found';
  END IF;

  SELECT * INTO v_store FROM public.stores WHERE id = v_order.store_id;
  SELECT * INTO v_ops FROM public.store_operational_settings WHERE store_id = v_order.store_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'product_name', oi.product_name,
    'sold_by', oi.sold_by,
    'quantity', oi.quantity,
    'weight_kg', oi.weight_kg,
    'price', oi.price,
    'item_notes', oi.item_notes
  ) ORDER BY oi.id), '[]'::jsonb)
  INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  v_receipt := repeat('=', 32) || E'\n';
  v_receipt := v_receipt || upper(COALESCE(v_ops.print_store_name, v_store.name)) || E'\n';
  v_receipt := v_receipt || repeat('=', 32) || E'\n\n';
  v_receipt := v_receipt || 'PEDIDO: #' || upper(split_part(p_order_id::text, '-', 1)) || E'\n';
  v_receipt := v_receipt || 'DATA: ' || to_char(v_order.created_at AT TIME ZONE COALESCE(v_ops.timezone, 'America/Aracaju'), 'DD/MM/YYYY HH24:MI') || E'\n\n';
  v_receipt := v_receipt || 'CLIENTE:' || E'\n' || v_order.customer_name || E'\n' || v_order.phone || E'\n\n';
  v_receipt := v_receipt || 'ENTREGA:' || E'\n' || v_order.address || E'\n\n';
  v_receipt := v_receipt || repeat('-', 32) || E'\nITENS DO PEDIDO\n' || repeat('-', 32) || E'\n';

  FOR v_item IN
    SELECT oi.* FROM public.order_items oi WHERE oi.order_id = p_order_id ORDER BY oi.id
  LOOP
    v_receipt := v_receipt || upper(v_item.product_name) || E'\n';
    IF v_item.sold_by = 'weight' THEN
      v_receipt := v_receipt || 'Quantidade: ' || COALESCE(v_item.weight_kg::text, '0') || ' kg' || E'\n';
    ELSE
      v_receipt := v_receipt || 'Quantidade: ' || v_item.quantity::text || ' un' || E'\n';
    END IF;
    v_receipt := v_receipt || 'Subtotal: R$ ' || replace(to_char(v_item.price, 'FM999999990.00'), '.', ',') || E'\n';
    IF v_item.item_notes IS NOT NULL AND length(trim(v_item.item_notes)) > 0 THEN
      v_receipt := v_receipt || 'Obs: ' || trim(v_item.item_notes) || E'\n';
    END IF;
    v_receipt := v_receipt || E'\n';
  END LOOP;

  v_receipt := v_receipt || repeat('-', 32) || E'\n\n';
  v_receipt := v_receipt || 'TOTAL: R$ ' || replace(to_char(v_order.total, 'FM999999990.00'), '.', ',') || E'\n\n';
  v_receipt := v_receipt || 'PAGAMENTO:' || E'\n';
  v_receipt := v_receipt || CASE COALESCE(v_order.payment_method, 'cash')
    WHEN 'pix' THEN 'PIX na entrega'
    WHEN 'credit' THEN 'Cartão na entrega'
    WHEN 'debit' THEN 'Débito na entrega'
    ELSE 'Pagamento na entrega (dinheiro)'
  END || E'\n';

  IF v_order.notes IS NOT NULL AND length(trim(v_order.notes)) > 0 THEN
    v_receipt := v_receipt || E'\nOBSERVACOES DO PEDIDO:\n' || trim(v_order.notes) || E'\n';
  END IF;

  v_receipt := v_receipt || E'\n' || repeat('=', 32);

  RETURN jsonb_build_object(
    'store_name', COALESCE(v_ops.print_store_name, v_store.name),
    'order_id', v_order.id,
    'created_at', v_order.created_at,
    'customer_name', v_order.customer_name,
    'phone', v_order.phone,
    'address', v_order.address,
    'payment_method', v_order.payment_method,
    'notes', v_order.notes,
    'total', v_order.total,
    'items', v_items,
    'receipt_text', v_receipt
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_order_print(
  p_order_id UUID,
  p_is_reprint BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_ops public.store_operational_settings%ROWTYPE;
  v_key TEXT;
  v_job_id UUID;
  v_payload JSONB;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found';
  END IF;

  SELECT * INTO v_ops FROM public.store_operational_settings WHERE store_id = v_order.store_id;

  IF COALESCE(v_ops.auto_print_enabled, false) IS NOT TRUE AND p_is_reprint IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  IF p_is_reprint THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'not authenticated';
    END IF;
    IF NOT (public.is_store_owner(v_order.store_id) OR public.is_platform_admin()) THEN
      RAISE EXCEPTION 'not authorized';
    END IF;
    v_key := p_order_id::text || ':reprint:' || gen_random_uuid()::text;
  ELSE
    v_key := p_order_id::text || ':initial';
    IF EXISTS (
      SELECT 1 FROM public.print_jobs
      WHERE idempotency_key = v_key
        AND status IN ('pending', 'claimed', 'printed')
    ) THEN
      RETURN NULL;
    END IF;
  END IF;

  v_payload := public._build_order_receipt_payload(p_order_id);

  INSERT INTO public.print_jobs (
    order_id, store_id, status, idempotency_key, payload, is_reprint, requested_by
  ) VALUES (
    p_order_id,
    v_order.store_id,
    'pending',
    v_key,
    v_payload,
    p_is_reprint,
    auth.uid()
  )
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_print_jobs(
  p_store_slug TEXT,
  p_agent_token TEXT,
  p_limit INTEGER DEFAULT 5
)
RETURNS SETOF public.print_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_store_id UUID;
  v_hash TEXT;
BEGIN
  IF p_store_slug IS NULL OR length(trim(p_agent_token)) < 8 THEN
    RAISE EXCEPTION 'invalid credentials';
  END IF;

  SELECT s.id, ops.print_agent_token_hash
  INTO v_store_id, v_hash
  FROM public.stores s
  LEFT JOIN public.store_operational_settings ops ON ops.store_id = s.id
  WHERE s.slug = p_store_slug AND s.active = true;

  IF v_store_id IS NULL OR v_hash IS NULL THEN
    RAISE EXCEPTION 'store not configured for printing';
  END IF;

  IF extensions.crypt(p_agent_token, v_hash) <> v_hash THEN
    RAISE EXCEPTION 'invalid agent token';
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT pj.id
    FROM public.print_jobs pj
    WHERE pj.store_id = v_store_id
      AND pj.status = 'pending'
    ORDER BY pj.requested_at
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5), 20))
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.print_jobs pj
    SET status = 'claimed', claimed_at = now(), attempt_count = pj.attempt_count + 1
    FROM picked
    WHERE pj.id = picked.id
    RETURNING pj.*
  )
  SELECT * FROM updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_print_job(
  p_job_id UUID,
  p_store_slug TEXT,
  p_agent_token TEXT,
  p_success BOOLEAN,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_store_id UUID;
  v_hash TEXT;
  v_job public.print_jobs%ROWTYPE;
BEGIN
  SELECT s.id, ops.print_agent_token_hash
  INTO v_store_id, v_hash
  FROM public.stores s
  LEFT JOIN public.store_operational_settings ops ON ops.store_id = s.id
  WHERE s.slug = p_store_slug AND s.active = true;

  IF v_store_id IS NULL OR v_hash IS NULL THEN
    RAISE EXCEPTION 'store not configured for printing';
  END IF;

  IF extensions.crypt(p_agent_token, v_hash) <> v_hash THEN
    RAISE EXCEPTION 'invalid agent token';
  END IF;

  SELECT * INTO v_job FROM public.print_jobs WHERE id = p_job_id AND store_id = v_store_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'job not found';
  END IF;

  IF p_success THEN
    UPDATE public.print_jobs
    SET status = 'printed', printed_at = now(), error_message = NULL
    WHERE id = p_job_id;
  ELSE
    UPDATE public.print_jobs
    SET status = 'failed', failed_at = now(), error_message = left(COALESCE(p_error_message, 'print failed'), 500)
    WHERE id = p_job_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_store_operational_settings(p_store_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
  v_ops public.store_operational_settings%ROWTYPE;
BEGIN
  SELECT id INTO v_store_id FROM public.stores WHERE slug = p_store_slug AND active = true;
  IF v_store_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_ops FROM public.store_operational_settings WHERE store_id = v_store_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'store_id', v_store_id,
      'timezone', 'America/Aracaju',
      'delivery_weekdays', ARRAY[1,2,3,4,5,6],
      'delivery_start_time', '08:00',
      'delivery_end_time', '17:00',
      'return_policy_text', NULL,
      'delivery_hours_message', 'Horário de entregas: segunda a sábado, das 08:00 às 17:00.',
      'outside_hours_message', 'No momento estamos fora do horário de entregas. Os pedidos podem ser registrados e serão atendidos conforme disponibilidade no próximo período de funcionamento.',
      'auto_print_enabled', false
    );
  END IF;

  RETURN jsonb_build_object(
    'store_id', v_ops.store_id,
    'timezone', v_ops.timezone,
    'delivery_weekdays', v_ops.delivery_weekdays,
    'delivery_start_time', to_char(v_ops.delivery_start_time, 'HH24:MI'),
    'delivery_end_time', to_char(v_ops.delivery_end_time, 'HH24:MI'),
    'return_policy_text', v_ops.return_policy_text,
    'delivery_hours_message', v_ops.delivery_hours_message,
    'outside_hours_message', v_ops.outside_hours_message,
    'auto_print_enabled', v_ops.auto_print_enabled
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_store_print_agent_token(
  p_token TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_store_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT id INTO v_store_id FROM public.stores WHERE user_id = auth.uid();
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'store not found';
  END IF;

  IF p_token IS NULL OR length(trim(p_token)) < 8 THEN
    RAISE EXCEPTION 'token must be at least 8 characters';
  END IF;

  INSERT INTO public.store_operational_settings (store_id, print_agent_token_hash)
  VALUES (v_store_id, extensions.crypt(trim(p_token), extensions.gen_salt('bf')))
  ON CONFLICT (store_id) DO UPDATE
  SET print_agent_token_hash = extensions.crypt(trim(p_token), extensions.gen_salt('bf')),
      updated_at = now();
END;
$$;

-- ---------- create_customer_order: item_notes + fila de impressão ----------
DROP FUNCTION IF EXISTS public.create_customer_order(
  TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, UUID, TEXT, TEXT, TEXT, BOOLEAN
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
  v_item_notes TEXT;
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
    SELECT 1 FROM public.orders o
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
      AND store_id = v_store.id AND active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'invalid product'; END IF;

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
    SELECT * INTO v_zone FROM public.delivery_zones
    WHERE id = p_delivery_zone_id AND store_id = v_store.id AND active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'invalid delivery zone'; END IF;
    IF COALESCE(v_zone.min_order, 0) > v_subtotal THEN RAISE EXCEPTION 'minimum order not met'; END IF;
    v_fee := COALESCE(v_zone.fee, 0);
  END IF;

  IF p_coupon_code IS NOT NULL AND length(trim(p_coupon_code)) > 0 THEN
    SELECT * INTO v_coupon FROM public.coupons
    WHERE store_id = v_store.id AND upper(code) = upper(trim(p_coupon_code)) AND active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'invalid coupon'; END IF;
    IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN RAISE EXCEPTION 'coupon expired'; END IF;
    IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN RAISE EXCEPTION 'coupon exhausted'; END IF;
    IF COALESCE(v_coupon.min_order, 0) > v_subtotal THEN RAISE EXCEPTION 'minimum order not met'; END IF;
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
    v_item_notes := NULLIF(left(trim(COALESCE(v_item->>'item_notes', '')), 500), '');

    IF p_sold = 'weight' THEN
      v_weight := (v_item->>'weight_kg')::NUMERIC;
      v_line := ROUND(COALESCE(v_product.price_per_kg, v_product.price) * v_weight, 2);
      INSERT INTO public.order_items (
        order_id, product_id, quantity, price, weight_kg, sold_by, needs_weighing, store_id, product_name, item_notes
      ) VALUES (
        v_order_id, v_product.id, 1, v_line, v_weight, 'weight', false, v_store.id, v_product.name, v_item_notes
      );
    ELSE
      v_qty := COALESCE((v_item->>'quantity')::NUMERIC, 1);
      v_line := ROUND(COALESCE(v_product.price_per_unit, v_product.price) * v_qty, 2);
      INSERT INTO public.order_items (
        order_id, product_id, quantity, price, sold_by, needs_weighing, store_id, product_name, item_notes
      ) VALUES (
        v_order_id, v_product.id, v_qty, v_line, 'unit', true, v_store.id, v_product.name, v_item_notes
      );
    END IF;
  END LOOP;

  IF v_coupon.id IS NOT NULL THEN
    PERFORM public.increment_coupon_usage(v_coupon.id);
  END IF;

  INSERT INTO public.order_tracking (order_id, status, notes, store_id)
  VALUES (v_order_id, 'pending', 'Pedido recebido', v_store.id);

  BEGIN
    PERFORM public.enqueue_order_print(v_order_id, false);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

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

GRANT EXECUTE ON FUNCTION public.get_store_operational_settings(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_order_print(UUID, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_print_jobs(TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_print_jobs(TEXT, TEXT, INTEGER) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_print_job(UUID, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_print_job(UUID, TEXT, TEXT, BOOLEAN, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_store_print_agent_token(TEXT) TO authenticated;

-- ---------- seed Beira Rio ----------
INSERT INTO public.store_operational_settings (
  store_id,
  timezone,
  delivery_weekdays,
  delivery_start_time,
  delivery_end_time,
  return_policy_text,
  delivery_hours_message,
  outside_hours_message,
  auto_print_enabled,
  print_store_name
)
SELECT
  s.id,
  'America/Aracaju',
  ARRAY[1,2,3,4,5,6]::SMALLINT[],
  '08:00'::TIME,
  '17:00'::TIME,
  'Só aceitamos devolução de mercadorias no ato da entrega.',
  'Horário de entregas: segunda a sábado, das 08:00 às 17:00.',
  'No momento estamos fora do horário de entregas. Os pedidos podem ser registrados e serão atendidos conforme disponibilidade no próximo período de funcionamento.',
  true,
  'BEIRA RIO HORTIFRUTI'
FROM public.stores s
WHERE s.slug = 'beira-rio'
ON CONFLICT (store_id) DO UPDATE SET
  timezone = EXCLUDED.timezone,
  delivery_weekdays = EXCLUDED.delivery_weekdays,
  delivery_start_time = EXCLUDED.delivery_start_time,
  delivery_end_time = EXCLUDED.delivery_end_time,
  return_policy_text = EXCLUDED.return_policy_text,
  delivery_hours_message = EXCLUDED.delivery_hours_message,
  outside_hours_message = EXCLUDED.outside_hours_message,
  auto_print_enabled = EXCLUDED.auto_print_enabled,
  print_store_name = EXCLUDED.print_store_name,
  updated_at = now();
