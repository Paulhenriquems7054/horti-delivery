-- Múltiplos donos por loja (store_members) + seed Beira Rio

CREATE TABLE IF NOT EXISTS public.store_members (
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_store_members_user_id ON public.store_members(user_id);

ALTER TABLE public.store_members ENABLE ROW LEVEL SECURITY;

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
  ) OR EXISTS (
    SELECT 1 FROM public.store_members sm
    WHERE sm.store_id = p_store_id AND sm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_store_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT id FROM public.stores WHERE user_id = auth.uid() LIMIT 1),
    (SELECT sm.store_id FROM public.store_members sm WHERE sm.user_id = auth.uid() LIMIT 1)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_my_store_id() TO authenticated;

DROP POLICY IF EXISTS stores_owner_select ON public.stores;
CREATE POLICY stores_owner_select ON public.stores
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.store_members sm
      WHERE sm.store_id = stores.id AND sm.user_id = auth.uid()
    )
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS stores_owner_update ON public.stores;
CREATE POLICY stores_owner_update ON public.stores
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.store_members sm
      WHERE sm.store_id = stores.id AND sm.user_id = auth.uid()
    )
    OR public.is_platform_admin()
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.store_members sm
      WHERE sm.store_id = stores.id AND sm.user_id = auth.uid()
    )
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS store_members_self_select ON public.store_members;
CREATE POLICY store_members_self_select ON public.store_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_store_owner(store_id)
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS store_members_admin_write ON public.store_members;
CREATE POLICY store_members_admin_write ON public.store_members
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

REVOKE ALL ON public.store_members FROM anon;
GRANT SELECT ON public.store_members TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_store()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  v_store_id := public.get_my_store_id();
  IF v_store_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT public.is_store_owner(v_store_id) THEN
    RETURN NULL;
  END IF;

  RETURN (
    SELECT to_jsonb(s) - 'delivery_pin_hash'
    FROM public.stores s
    WHERE s.id = v_store_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_store() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_store() TO authenticated;

CREATE OR REPLACE FUNCTION public.update_store_delivery_pin(p_pin TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_pin TEXT;
  v_store_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_pin := trim(COALESCE(p_pin, ''));
  IF length(v_pin) < 6 OR length(v_pin) > 8 OR v_pin !~ '^\d+$' THEN
    RAISE EXCEPTION 'invalid pin';
  END IF;

  v_store_id := public.get_my_store_id();
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'store not found';
  END IF;

  UPDATE public.stores
  SET delivery_pin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf', 8))
  WHERE id = v_store_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_store_print_agent_token(p_token TEXT)
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

  v_store_id := public.get_my_store_id();
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

CREATE OR REPLACE FUNCTION public.update_store_logo_path(p_logo_path TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
  v_expected_prefix TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_store_id := public.get_my_store_id();
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'store not found';
  END IF;

  IF p_logo_path IS NOT NULL AND length(trim(p_logo_path)) > 0 THEN
    v_expected_prefix := 'logos/' || v_store_id::text || '/';
    IF left(trim(p_logo_path), length(v_expected_prefix)) <> v_expected_prefix THEN
      RAISE EXCEPTION 'invalid logo path';
    END IF;
    UPDATE public.stores
    SET logo_path = trim(p_logo_path), updated_at = now()
    WHERE id = v_store_id;
  ELSE
    UPDATE public.stores
    SET logo_path = NULL, updated_at = now()
    WHERE id = v_store_id;
  END IF;
END;
$$;

-- Beira Rio: Danilo = dono principal; Diogo e Claudivan = co-donos
UPDATE public.stores
SET user_id = 'c5c0d2f9-ecef-464f-a065-a2a46849e679'
WHERE slug = 'beira-rio';

INSERT INTO public.store_members (store_id, user_id, role)
SELECT s.id, u.id, 'owner'
FROM public.stores s
JOIN auth.users u ON lower(u.email) IN (
  'diogobeirario@gmail.com',
  'claudivanbeirario@gmail.com'
)
WHERE s.slug = 'beira-rio'
ON CONFLICT (store_id, user_id) DO NOTHING;
