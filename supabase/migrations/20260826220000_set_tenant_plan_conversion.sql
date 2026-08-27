-- Ajusta set_tenant_plan: conversão explícita trial → active
-- somente com data de assinatura FUTURA.
-- Data residual/passada NÃO promove o trial.
-- Não aplica no Hosted nesta etapa.
-- Preserva trial_ends_at. Não mexe em blocked/cancelled.

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
DECLARE
  v_status TEXT;
  v_converted BOOLEAN := false;
BEGIN
  PERFORM public.assert_platform_admin();

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'invalid store';
  END IF;
  IF p_plan IS NULL OR p_plan NOT IN ('basic', 'pro', 'enterprise') THEN
    RAISE EXCEPTION 'invalid plan';
  END IF;

  SELECT subscription_status
    INTO v_status
    FROM public.stores
   WHERE id = p_store_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'store not found';
  END IF;

  -- Trial + data passada/residual: recusar. Não é contratação.
  IF v_status = 'trial' AND p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    RAISE EXCEPTION 'expiry must be in the future';
  END IF;

  v_converted := (v_status = 'trial' AND p_expires_at IS NOT NULL AND p_expires_at > now());

  UPDATE public.stores
  SET
    subscription_plan = p_plan,
    subscription_expires_at = CASE
      WHEN v_status = 'trial' AND p_expires_at IS NULL THEN subscription_expires_at
      ELSE p_expires_at
    END,
    subscription_status = CASE
      WHEN v_status IN ('blocked', 'cancelled') THEN v_status
      WHEN v_converted THEN 'active'
      ELSE v_status
    END
  WHERE id = p_store_id;

  INSERT INTO public.subscription_events (store_id, event_type, notes, created_by)
  VALUES (
    p_store_id,
    'plan_changed',
    CASE
      WHEN v_converted THEN 'Trial converted to paid plan ' || p_plan
      ELSE 'Plan set to ' || p_plan
    END,
    auth.uid()::text
  );

  PERFORM public._log_platform_action(
    p_store_id,
    'platform.set_tenant_plan',
    jsonb_build_object(
      'plan', p_plan,
      'expires_at', p_expires_at,
      'converted_from_trial', v_converted
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_tenant_plan(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_tenant_plan(UUID, TEXT, TIMESTAMPTZ) TO authenticated;
