-- Hardening do fluxo de impressão (pós-auditoria Beira Rio)
-- Aplicar APÓS 20260828180000_beira_rio_store_features.sql
-- Não altera a migration original.

-- ============================================================
-- B1/B5 — Fechar SELECT direto em store_operational_settings
-- ============================================================
DROP POLICY IF EXISTS store_ops_public_read ON public.store_operational_settings;

DROP POLICY IF EXISTS store_ops_owner_write ON public.store_operational_settings;

DROP POLICY IF EXISTS store_ops_owner_select ON public.store_operational_settings;
DROP POLICY IF EXISTS store_ops_owner_insert ON public.store_operational_settings;
DROP POLICY IF EXISTS store_ops_owner_update ON public.store_operational_settings;
DROP POLICY IF EXISTS store_ops_owner_delete ON public.store_operational_settings;

CREATE POLICY store_ops_owner_select ON public.store_operational_settings
  FOR SELECT TO authenticated
  USING (public.is_store_owner(store_id) OR public.is_platform_admin());

CREATE POLICY store_ops_owner_insert ON public.store_operational_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_store_owner(store_id) OR public.is_platform_admin());

CREATE POLICY store_ops_owner_update ON public.store_operational_settings
  FOR UPDATE TO authenticated
  USING (public.is_store_owner(store_id) OR public.is_platform_admin())
  WITH CHECK (public.is_store_owner(store_id) OR public.is_platform_admin());

CREATE POLICY store_ops_owner_delete ON public.store_operational_settings
  FOR DELETE TO authenticated
  USING (public.is_store_owner(store_id) OR public.is_platform_admin());

REVOKE ALL ON public.store_operational_settings FROM anon;
REVOKE ALL ON public.store_operational_settings FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_operational_settings TO authenticated;

-- Hash do token nunca legível via PostgREST (RPC SECURITY DEFINER continua podendo gravar)
REVOKE SELECT (print_agent_token_hash) ON public.store_operational_settings FROM authenticated;
REVOKE UPDATE (print_agent_token_hash) ON public.store_operational_settings FROM authenticated;

-- ============================================================
-- B1/B4 — Fechar acesso direto a print_jobs
-- ============================================================
REVOKE ALL ON public.print_jobs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.print_jobs FROM authenticated;

-- ============================================================
-- B3 — Payload PII: função interna sem EXECUTE público
-- ============================================================
REVOKE ALL ON FUNCTION public._build_order_receipt_payload(UUID) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- B2 — Revogar enqueue_order_print público (substituído abaixo)
-- ============================================================
REVOKE ALL ON FUNCTION public.enqueue_order_print(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- W5 — Rate limit + credenciais genéricas do agente
-- ============================================================
CREATE OR REPLACE FUNCTION public._assert_print_agent_rate_limit(p_store_slug TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed BOOLEAN;
BEGIN
  SELECT public.check_rate_limit(
    'print_agent:' || lower(trim(p_store_slug)),
    'print_agent_auth',
    10,
    15
  ) INTO v_allowed;

  IF v_allowed IS FALSE THEN
    RAISE EXCEPTION 'invalid credentials';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._assert_print_agent_rate_limit(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._verify_print_agent_credentials(
  p_store_slug TEXT,
  p_agent_token TEXT,
  OUT store_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  store_id := NULL;

  IF p_store_slug IS NULL OR length(trim(COALESCE(p_agent_token, ''))) < 8 THEN
    RAISE EXCEPTION 'invalid credentials';
  END IF;

  PERFORM public._assert_print_agent_rate_limit(p_store_slug);

  SELECT s.id, ops.print_agent_token_hash
  INTO store_id, v_hash
  FROM public.stores s
  LEFT JOIN public.store_operational_settings ops ON ops.store_id = s.id
  WHERE s.slug = lower(trim(p_store_slug)) AND s.active = true;

  IF store_id IS NULL OR v_hash IS NULL THEN
    RAISE EXCEPTION 'invalid credentials';
  END IF;

  IF extensions.crypt(trim(p_agent_token), v_hash) <> v_hash THEN
    RAISE EXCEPTION 'invalid credentials';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._verify_print_agent_credentials(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- W2 — Recuperação conservadora de jobs claimed presos (10 min)
-- ============================================================
CREATE OR REPLACE FUNCTION public._reclaim_stale_claimed_print_jobs(p_store_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH stale AS (
    SELECT pj.id
    FROM public.print_jobs pj
    WHERE pj.store_id = p_store_id
      AND pj.status = 'claimed'
      AND pj.claimed_at IS NOT NULL
      AND pj.claimed_at < now() - interval '10 minutes'
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.print_jobs pj
  SET status = 'pending',
      claimed_at = NULL
  FROM stale
  WHERE pj.id = stale.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public._reclaim_stale_claimed_print_jobs(UUID) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- B2 — Job inicial: somente fluxo interno confiável
-- ============================================================
CREATE OR REPLACE FUNCTION public._enqueue_initial_order_print(p_order_id UUID)
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

  IF COALESCE(v_ops.auto_print_enabled, false) IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  v_key := p_order_id::text || ':initial';
  IF EXISTS (
    SELECT 1 FROM public.print_jobs
    WHERE idempotency_key = v_key
      AND status IN ('pending', 'claimed', 'printed')
  ) THEN
    RETURN NULL;
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
    false,
    auth.uid()
  )
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public._enqueue_initial_order_print(UUID) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- B2 — Reimpressão: RPC autenticada dedicada (sem boolean bypass)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reprint_order(p_order_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_key TEXT;
  v_job_id UUID;
  v_payload JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found';
  END IF;

  IF NOT (public.is_store_owner(v_order.store_id) OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_key := p_order_id::text || ':reprint:' || gen_random_uuid()::text;
  v_payload := public._build_order_receipt_payload(p_order_id);

  INSERT INTO public.print_jobs (
    order_id, store_id, status, idempotency_key, payload, is_reprint, requested_by
  ) VALUES (
    p_order_id,
    v_order.store_id,
    'pending',
    v_key,
    v_payload,
    true,
    auth.uid()
  )
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reprint_order(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reprint_order(UUID) TO authenticated;

-- ============================================================
-- W4/W6 — RPC pública minimizada (sem store_id, sem auto_print)
-- ============================================================
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
      'timezone', 'America/Aracaju',
      'delivery_weekdays', ARRAY[1,2,3,4,5,6],
      'delivery_start_time', '08:00',
      'delivery_end_time', '17:00',
      'return_policy_text', NULL,
      'delivery_hours_message', 'Horário de entregas: segunda a sábado, das 08:00 às 17:00.',
      'outside_hours_message', 'No momento estamos fora do horário de entregas. Os pedidos podem ser registrados e serão atendidos conforme disponibilidade no próximo período de funcionamento.'
    );
  END IF;

  RETURN jsonb_build_object(
    'timezone', v_ops.timezone,
    'delivery_weekdays', v_ops.delivery_weekdays,
    'delivery_start_time', to_char(v_ops.delivery_start_time, 'HH24:MI'),
    'delivery_end_time', to_char(v_ops.delivery_end_time, 'HH24:MI'),
    'return_policy_text', v_ops.return_policy_text,
    'delivery_hours_message', v_ops.delivery_hours_message,
    'outside_hours_message', v_ops.outside_hours_message
  );
END;
$$;

-- ============================================================
-- W1/W2/W3/W6 — claim_print_jobs: reclaim + retorno mínimo
-- ============================================================
DROP FUNCTION IF EXISTS public.claim_print_jobs(TEXT, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.claim_print_jobs(
  p_store_slug TEXT,
  p_agent_token TEXT,
  p_limit INTEGER DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_store_id UUID;
  v_result JSONB;
BEGIN
  v_store_id := public._verify_print_agent_credentials(p_store_slug, p_agent_token);

  PERFORM public._reclaim_stale_claimed_print_jobs(v_store_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'job_id', u.id,
    'order_id', u.order_id,
    'payload', u.payload
  ) ORDER BY u.requested_at), '[]'::jsonb)
  INTO v_result
  FROM (
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
      SET status = 'claimed',
          claimed_at = now(),
          attempt_count = pj.attempt_count + 1
      FROM picked
      WHERE pj.id = picked.id
        AND pj.status = 'pending'
      RETURNING pj.*
    )
    SELECT * FROM updated
  ) u;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_print_jobs(TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_print_jobs(TEXT, TEXT, INTEGER) TO anon, authenticated;

-- ============================================================
-- W1/W5 — complete_print_job: máquina de estados estrita
-- ============================================================
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
  v_rows INTEGER;
BEGIN
  v_store_id := public._verify_print_agent_credentials(p_store_slug, p_agent_token);

  IF p_success THEN
    UPDATE public.print_jobs
    SET status = 'printed',
        printed_at = now(),
        error_message = NULL
    WHERE id = p_job_id
      AND store_id = v_store_id
      AND status = 'claimed';
  ELSE
    UPDATE public.print_jobs
    SET status = 'failed',
        failed_at = now(),
        error_message = left(COALESCE(p_error_message, 'print failed'), 500)
    WHERE id = p_job_id
      AND store_id = v_store_id
      AND status = 'claimed';
  END IF;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'invalid job state';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_print_job(UUID, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_print_job(UUID, TEXT, TEXT, BOOLEAN, TEXT) TO anon, authenticated;

-- ============================================================
-- W3 — create_customer_order: loop defensivo + job inicial interno
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
    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::UUID
      AND store_id = v_store.id AND active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'invalid product'; END IF;

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
    PERFORM public._enqueue_initial_order_print(v_order_id);
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
