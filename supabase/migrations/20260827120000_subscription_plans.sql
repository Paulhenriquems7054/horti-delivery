-- Catálogo comercial dos planos (basic | pro | enterprise).
-- NÃO aplicar no Hosted nesta tarefa.
-- NÃO altera set_tenant_plan nem promove trial → active.
-- stores.subscription_plan continua sendo o código (texto); preço e max_users ficam aqui.

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  currency TEXT NOT NULL DEFAULT 'BRL',
  billing_period TEXT NOT NULL DEFAULT 'monthly',
  max_users INTEGER NOT NULL CHECK (max_users >= 1),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscription_plans_code_chk CHECK (code IN ('basic', 'pro', 'enterprise')),
  CONSTRAINT subscription_plans_period_chk CHECK (billing_period IN ('monthly'))
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON public.subscription_plans (is_active);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.subscription_plans FROM PUBLIC, anon, authenticated;

INSERT INTO public.subscription_plans (code, name, price, currency, billing_period, max_users, is_active)
VALUES
  ('basic', 'Basic', 49.90, 'BRL', 'monthly', 2, true),
  ('pro', 'Pro', 99.90, 'BRL', 'monthly', 5, true),
  ('enterprise', 'Enterprise', 199.90, 'BRL', 'monthly', 15, true)
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.list_subscription_plans()
RETURNS TABLE (
  code TEXT,
  name TEXT,
  price NUMERIC,
  currency TEXT,
  billing_period TEXT,
  max_users INTEGER,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_platform_admin();
  RETURN QUERY
  SELECT
    p.code,
    p.name,
    p.price,
    p.currency,
    p.billing_period,
    p.max_users,
    p.is_active
  FROM public.subscription_plans p
  ORDER BY array_position(ARRAY['basic', 'pro', 'enterprise'], p.code);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_subscription_plan(
  p_code TEXT,
  p_name TEXT,
  p_price NUMERIC,
  p_max_users INTEGER,
  p_is_active BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_platform_admin();

  IF p_code IS NULL OR p_code NOT IN ('basic', 'pro', 'enterprise') THEN
    RAISE EXCEPTION 'invalid plan';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) < 1 THEN
    RAISE EXCEPTION 'invalid name';
  END IF;
  IF p_price IS NULL OR p_price < 0 THEN
    RAISE EXCEPTION 'invalid price';
  END IF;
  IF p_max_users IS NULL OR p_max_users < 1 THEN
    RAISE EXCEPTION 'invalid max_users';
  END IF;

  UPDATE public.subscription_plans
  SET
    name = trim(p_name),
    price = p_price,
    max_users = p_max_users,
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE code = p_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan not found';
  END IF;
END;
$$;

-- Contagem atual: 1 se a loja tem dono em stores.user_id.
-- Não há tabela de membros extras. Usar esta função quando houver criação de usuários.
CREATE OR REPLACE FUNCTION public.store_active_access_user_count(p_store_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN s.user_id IS NULL THEN 0 ELSE 1 END
  FROM public.stores s
  WHERE s.id = p_store_id;
$$;

CREATE OR REPLACE FUNCTION public.store_plan_user_limit(p_store_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(p.max_users, 1)
  FROM public.stores s
  LEFT JOIN public.subscription_plans p ON p.code = s.subscription_plan
  WHERE s.id = p_store_id;
$$;

REVOKE ALL ON FUNCTION public.list_subscription_plans() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_subscription_plans() TO authenticated;

REVOKE ALL ON FUNCTION public.update_subscription_plan(TEXT, TEXT, NUMERIC, INTEGER, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_subscription_plan(TEXT, TEXT, NUMERIC, INTEGER, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.store_active_access_user_count(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.store_active_access_user_count(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.store_plan_user_limit(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.store_plan_user_limit(UUID) TO authenticated;
