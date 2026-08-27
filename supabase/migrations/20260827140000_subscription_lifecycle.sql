-- Ciclo de vida da assinatura paga.
-- NÃO aplicar no Hosted nesta tarefa.
-- NÃO altera 20260826220000.
-- NÃO faz backfill. NÃO converte lojas existentes.
-- NÃO promove trial só porque subscription_expires_at está preenchido.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ;

-- list_tenants: inclui subscription_started_at (DROP necessário pela mudança de OUT).
DROP FUNCTION IF EXISTS public.list_tenants();

CREATE FUNCTION public.list_tenants()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  name TEXT,
  slug TEXT,
  email TEXT,
  phone TEXT,
  description TEXT,
  active BOOLEAN,
  subscription_status TEXT,
  subscription_plan TEXT,
  subscription_expires_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  subscription_started_at TIMESTAMPTZ,
  blocked_reason TEXT,
  blocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_platform_admin();

  RETURN QUERY
  SELECT
    s.id,
    s.user_id,
    s.name,
    s.slug,
    s.email,
    s.phone,
    s.description,
    s.active,
    s.subscription_status,
    s.subscription_plan,
    s.subscription_expires_at,
    s.trial_ends_at,
    s.subscription_started_at,
    s.blocked_reason,
    s.blocked_at,
    s.created_at
  FROM public.stores s
  ORDER BY s.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_tenants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_tenants() TO authenticated;

-- Alterar plano: só o código. Nunca muda status, datas de trial/pagamento ou active.
CREATE OR REPLACE FUNCTION public.set_tenant_plan(
  p_store_id UUID,
  p_plan TEXT,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_platform_admin();

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'invalid store';
  END IF;
  IF p_plan IS NULL OR p_plan NOT IN ('basic', 'pro', 'enterprise') THEN
    RAISE EXCEPTION 'invalid plan';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id) THEN
    RAISE EXCEPTION 'store not found';
  END IF;

  -- p_expires_at é ignorado de propósito: troca de plano ≠ contratação.
  UPDATE public.stores
  SET subscription_plan = p_plan
  WHERE id = p_store_id;

  INSERT INTO public.subscription_events (store_id, event_type, notes, created_by)
  VALUES (p_store_id, 'plan_changed', 'Plan set to ' || p_plan, auth.uid()::text);

  PERFORM public._log_platform_action(
    p_store_id,
    'platform.set_tenant_plan',
    jsonb_build_object('plan', p_plan)
  );
END;
$$;

-- Conversão explícita trial → assinatura paga.
-- Início é informado pela Super Admin (permite simular vencimento).
DROP FUNCTION IF EXISTS public.convert_trial_to_paid(UUID, TEXT, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.convert_trial_to_paid(
  p_store_id UUID,
  p_plan TEXT,
  p_expires_at TIMESTAMPTZ,
  p_started_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_started TIMESTAMPTZ;
BEGIN
  PERFORM public.assert_platform_admin();

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'invalid store';
  END IF;
  IF p_plan IS NULL OR p_plan NOT IN ('basic', 'pro', 'enterprise') THEN
    RAISE EXCEPTION 'invalid plan';
  END IF;

  v_started := COALESCE(p_started_at, now());
  IF p_expires_at IS NULL THEN
    RAISE EXCEPTION 'expiry required';
  END IF;
  IF p_expires_at <= v_started THEN
    RAISE EXCEPTION 'expiry must be after start';
  END IF;

  SELECT subscription_status INTO v_status
  FROM public.stores
  WHERE id = p_store_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'store not found';
  END IF;
  IF v_status <> 'trial' THEN
    RAISE EXCEPTION 'store is not in trial';
  END IF;

  UPDATE public.stores
  SET
    subscription_plan = p_plan,
    subscription_status = 'active',
    subscription_started_at = v_started,
    subscription_expires_at = p_expires_at,
    active = true
  WHERE id = p_store_id;

  INSERT INTO public.subscription_events (store_id, event_type, notes, created_by)
  VALUES (
    p_store_id,
    'activated',
    'Trial converted to paid plan ' || p_plan,
    auth.uid()::text
  );

  PERFORM public._log_platform_action(
    p_store_id,
    'platform.convert_trial_to_paid',
    jsonb_build_object('plan', p_plan, 'started_at', v_started, 'expires_at', p_expires_at)
  );
END;
$$;

-- Renovação: só loja already paid/active. Preserva subscription_started_at.
CREATE OR REPLACE FUNCTION public.renew_paid_subscription(
  p_store_id UUID,
  p_expires_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  PERFORM public.assert_platform_admin();

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'invalid store';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'expiry must be in the future';
  END IF;

  SELECT subscription_status INTO v_status
  FROM public.stores
  WHERE id = p_store_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'store not found';
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'store is not on a paid subscription';
  END IF;

  UPDATE public.stores
  SET subscription_expires_at = p_expires_at
  WHERE id = p_store_id;

  INSERT INTO public.subscription_events (store_id, event_type, notes, created_by)
  VALUES (p_store_id, 'plan_changed', 'Paid subscription renewed', auth.uid()::text);

  PERFORM public._log_platform_action(
    p_store_id,
    'platform.renew_paid_subscription',
    jsonb_build_object('expires_at', p_expires_at)
  );
END;
$$;

-- Desbloqueio: não reativa assinatura vencida. Trial vigente continua trial.
CREATE OR REPLACE FUNCTION public.set_tenant_status(
  p_store_id UUID,
  p_active BOOLEAN,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.stores%ROWTYPE;
  v_event TEXT;
BEGIN
  PERFORM public.assert_platform_admin();

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'invalid store';
  END IF;

  SELECT * INTO v_row FROM public.stores WHERE id = p_store_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'store not found';
  END IF;

  IF p_active THEN
    IF v_row.subscription_expires_at IS NOT NULL
       AND v_row.subscription_expires_at <= now()
       AND v_row.subscription_started_at IS NOT NULL THEN
      RAISE EXCEPTION 'subscription expired';
    END IF;

    UPDATE public.stores
    SET
      active = true,
      blocked_reason = NULL,
      blocked_at = NULL,
      subscription_status = CASE
        WHEN trial_ends_at IS NOT NULL AND trial_ends_at > now()
             AND subscription_started_at IS NULL THEN 'trial'
        WHEN subscription_status = 'cancelled' THEN 'cancelled'
        WHEN subscription_expires_at IS NOT NULL AND subscription_expires_at > now() THEN 'active'
        WHEN subscription_status = 'trial' THEN 'trial'
        ELSE 'active'
      END
    WHERE id = p_store_id;
    v_event := 'unblocked';
  ELSE
    IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
      RAISE EXCEPTION 'reason required';
    END IF;
    UPDATE public.stores
    SET
      active = false,
      subscription_status = 'blocked',
      blocked_reason = trim(p_reason),
      blocked_at = now()
    WHERE id = p_store_id;
    v_event := 'blocked';
  END IF;

  INSERT INTO public.subscription_events (store_id, event_type, notes, created_by)
  VALUES (
    p_store_id,
    v_event,
    CASE WHEN p_active THEN 'Unblocked by platform admin' ELSE trim(p_reason) END,
    auth.uid()::text
  );

  PERFORM public._log_platform_action(
    p_store_id,
    CASE WHEN p_active THEN 'platform.unblock_tenant' ELSE 'platform.block_tenant' END,
    jsonb_build_object('reason', p_reason)
  );
END;
$$;

-- Job: só active + expires_at vencido. Idempotente. Não toca trial/cancelled.
CREATE OR REPLACE FUNCTION public.block_expired_paid_subscriptions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids UUID[];
  v_count INTEGER;
BEGIN
  WITH expired AS (
    SELECT id
    FROM public.stores
    WHERE subscription_status = 'active'
      AND subscription_expires_at IS NOT NULL
      AND subscription_expires_at <= now()
    FOR UPDATE
  ),
  updated AS (
    UPDATE public.stores s
    SET
      subscription_status = 'blocked',
      active = false,
      blocked_at = now(),
      blocked_reason = 'Assinatura vencida'
    FROM expired
    WHERE s.id = expired.id
    RETURNING s.id
  )
  SELECT COALESCE(array_agg(id), ARRAY[]::UUID[]), COUNT(*)::INTEGER
    INTO v_ids, v_count
  FROM updated;

  IF v_count > 0 THEN
    INSERT INTO public.subscription_events (store_id, event_type, notes, created_by)
    SELECT x, 'blocked', 'Assinatura vencida', 'system'
    FROM unnest(v_ids) AS x;
  END IF;

  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.convert_trial_to_paid(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_trial_to_paid(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

REVOKE ALL ON FUNCTION public.renew_paid_subscription(UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renew_paid_subscription(UUID, TIMESTAMPTZ) TO authenticated;

REVOKE ALL ON FUNCTION public.block_expired_paid_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.block_expired_paid_subscriptions() TO service_role;
