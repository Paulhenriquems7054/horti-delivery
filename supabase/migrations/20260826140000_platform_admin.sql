-- HortiDelivery — Identidade de plataforma + RPCs Super Admin
-- NÃO altera a 2B. Isolamento lojista (user_id = auth.uid()) permanece.
-- Bootstrap do primeiro operador: ver comentário no final (NÃO executar nesta fase).

-- ============================================================
-- platform_admins
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  notes TEXT
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_admins FROM PUBLIC, anon, authenticated;

-- Sem policies para anon/authenticated: ninguém lista/insere/altera via PostgREST.
-- INSERT inicial só via SQL Editor (role postgres / service_role).

-- ============================================================
-- is_platform_admin() — auth.uid() apenas; frontend não escolhe o user
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins
    WHERE user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.assert_platform_admin()
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
END;
$$;

-- ============================================================
-- Auditoria de plataforma (reusa audit_logs)
-- ============================================================
CREATE OR REPLACE FUNCTION public._log_platform_action(
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
  INSERT INTO public.audit_logs (store_id, user_id, action, metadata)
  VALUES (p_store_id, auth.uid(), p_action, p_metadata);
END;
$$;

-- ============================================================
-- list_tenants
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_tenants()
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
    s.blocked_reason,
    s.blocked_at,
    s.created_at
  FROM public.stores s
  ORDER BY s.created_at DESC;
END;
$$;

-- ============================================================
-- list_tenant_events (histórico do card; sem SELECT direto)
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_tenant_events(p_store_id UUID)
RETURNS TABLE (
  id UUID,
  event_type TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_platform_admin();
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'invalid store';
  END IF;

  RETURN QUERY
  SELECT e.id, e.event_type, e.notes, e.created_by, e.created_at
  FROM public.subscription_events e
  WHERE e.store_id = p_store_id
  ORDER BY e.created_at DESC
  LIMIT 20;
END;
$$;

-- ============================================================
-- set_tenant_status
-- ============================================================
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
  v_exists BOOLEAN;
  v_event TEXT;
BEGIN
  PERFORM public.assert_platform_admin();

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'invalid store';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.stores WHERE id = p_store_id) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'store not found';
  END IF;

  IF p_active THEN
    -- active = operacional (vitrine). subscription_status inclui trial/cancelled.
    -- Não forçar 'active' comercial se o trial ainda estiver vigente.
    UPDATE public.stores
    SET
      active = true,
      blocked_reason = NULL,
      blocked_at = NULL,
      subscription_status = CASE
        WHEN trial_ends_at IS NOT NULL AND trial_ends_at > now() THEN 'trial'
        WHEN subscription_status IN ('trial', 'cancelled') THEN subscription_status
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
  VALUES (p_store_id, v_event, CASE WHEN p_active THEN 'Unblocked by platform admin' ELSE trim(p_reason) END, auth.uid()::text);

  PERFORM public._log_platform_action(
    p_store_id,
    CASE WHEN p_active THEN 'platform.unblock_tenant' ELSE 'platform.block_tenant' END,
    jsonb_build_object('reason', p_reason)
  );
END;
$$;

-- ============================================================
-- set_tenant_plan
-- Planos usados no painel: basic | pro | enterprise
-- (stores.subscription_plan não tem CHECK; validamos aqui)
-- ============================================================
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

  UPDATE public.stores
  SET
    subscription_plan = p_plan,
    subscription_expires_at = p_expires_at
  WHERE id = p_store_id;

  INSERT INTO public.subscription_events (store_id, event_type, notes, created_by)
  VALUES (p_store_id, 'plan_changed', 'Plan set to ' || p_plan, auth.uid()::text);

  PERFORM public._log_platform_action(
    p_store_id,
    'platform.set_tenant_plan',
    jsonb_build_object('plan', p_plan, 'expires_at', p_expires_at)
  );
END;
$$;

-- ============================================================
-- provision_tenant_for_user
-- Auth NÃO é criado aqui (exige Admin API). Chamado pela Edge Function
-- depois de criar o usuário, ou em retry se o Auth já existir.
-- Transação Postgres: store + basket + catálogo + evento.
-- Se o catálogo falhar, store/basket sofrem ROLLBACK.
-- Usuário Auth fora desta transação: compensação na Edge Function.
-- Idempotente por user_id: devolve a store existente, NÃO altera slug nem demais dados.
-- ============================================================
CREATE OR REPLACE FUNCTION public.provision_tenant_for_user(
  p_user_id UUID,
  p_name TEXT,
  p_slug TEXT,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_plan TEXT DEFAULT 'basic'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store public.stores%ROWTYPE;
  v_basket_id UUID;
  v_slug TEXT;
  v_product_id UUID;
  dp RECORD;
BEGIN
  PERFORM public.assert_platform_admin();

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid user';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) < 2 THEN
    RAISE EXCEPTION 'invalid name';
  END IF;

  v_slug := lower(trim(p_slug));
  IF v_slug IS NULL OR v_slug !~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$' THEN
    RAISE EXCEPTION 'invalid slug';
  END IF;
  IF p_plan IS NULL OR p_plan NOT IN ('basic', 'pro', 'enterprise') THEN
    RAISE EXCEPTION 'invalid plan';
  END IF;

  SELECT * INTO v_store FROM public.stores WHERE user_id = p_user_id;
  IF FOUND THEN
    -- Mesmo user_id: não cria segunda loja, não muda slug/plano/dados.
    RETURN jsonb_build_object(
      'id', v_store.id,
      'slug', v_store.slug,
      'user_id', v_store.user_id,
      'reused', true,
      'requested_slug', v_slug,
      'slug_mismatch', (v_store.slug IS DISTINCT FROM v_slug)
    );
  END IF;

  IF EXISTS (SELECT 1 FROM public.stores WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'slug in use';
  END IF;

  INSERT INTO public.stores (
    user_id, name, slug, email, phone, active,
    subscription_status, subscription_plan, trial_ends_at
  ) VALUES (
    p_user_id,
    trim(p_name),
    v_slug,
    NULLIF(trim(COALESCE(p_email, '')), ''),
    NULLIF(trim(COALESCE(p_phone, '')), ''),
    true,
    'trial',
    p_plan,
    now() + interval '14 days'
  )
  RETURNING * INTO v_store;

  INSERT INTO public.baskets (name, price, store_id, active)
  VALUES ('Catalog | ' || v_store.name, 0, v_store.id, true)
  RETURNING id INTO v_basket_id;

  FOR dp IN SELECT * FROM public.default_products WHERE active = true LOOP
    INSERT INTO public.products (name, price, image_url, unit, active, store_id)
    VALUES (dp.name, dp.price, dp.image_url, dp.unit, true, v_store.id)
    RETURNING id INTO v_product_id;

    INSERT INTO public.basket_items (basket_id, product_id, quantity, store_id)
    VALUES (v_basket_id, v_product_id, 1, v_store.id);
  END LOOP;

  INSERT INTO public.subscription_events (store_id, event_type, notes, created_by)
  VALUES (v_store.id, 'trial_started', 'Provisioned by platform admin', auth.uid()::text);

  PERFORM public._log_platform_action(
    v_store.id,
    'platform.provision_tenant',
    jsonb_build_object('user_id', p_user_id, 'slug', v_slug, 'plan', p_plan)
  );

  RETURN jsonb_build_object(
    'id', v_store.id,
    'slug', v_store.slug,
    'user_id', v_store.user_id,
    'basket_id', v_basket_id,
    'reused', false
  );
END;
$$;

-- ============================================================
-- GRANT / REVOKE
-- ============================================================
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.assert_platform_admin() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public._log_platform_action(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.list_tenants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_tenants() TO authenticated;

REVOKE ALL ON FUNCTION public.list_tenant_events(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_tenant_events(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.set_tenant_status(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_tenant_status(UUID, BOOLEAN, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.set_tenant_plan(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_tenant_plan(UUID, TEXT, TIMESTAMPTZ) TO authenticated;

REVOKE ALL ON FUNCTION public.provision_tenant_for_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_tenant_for_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Lojista authenticated PODE chamar as RPCs, mas o corpo RAISE se não for platform admin.
-- anon NÃO recebe EXECUTE.

-- ============================================================
-- BOOTSTRAP (somente documentação — NÃO executar nesta fase)
--
-- No SQL Editor do hosted, autenticado como postgres:
--
--   INSERT INTO public.platform_admins (user_id, notes)
--   SELECT id, 'bootstrap'
--   FROM auth.users
--   WHERE email = 'EMAIL_DO_OPERADOR'
--   ON CONFLICT (user_id) DO NOTHING;
--
-- Substitua EMAIL_DO_OPERADOR por um usuário Auth já existente.
-- Não cria usuário. Não usa o frontend.
-- ============================================================
