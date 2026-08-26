-- RPC administrativa: atualizar dados cadastrais da loja.
-- Não altera 2B nem 140000. Não mexe em plano, status nem auth.users.

CREATE OR REPLACE FUNCTION public.update_tenant(
  p_store_id UUID,
  p_name TEXT,
  p_slug TEXT,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug TEXT;
BEGIN
  PERFORM public.assert_platform_admin();

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'invalid store';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) < 2 THEN
    RAISE EXCEPTION 'invalid name';
  END IF;

  v_slug := lower(trim(p_slug));
  IF v_slug IS NULL OR v_slug !~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$' THEN
    RAISE EXCEPTION 'invalid slug';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id) THEN
    RAISE EXCEPTION 'store not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stores
    WHERE slug = v_slug AND id IS DISTINCT FROM p_store_id
  ) THEN
    RAISE EXCEPTION 'slug in use';
  END IF;

  UPDATE public.stores
  SET
    name = trim(p_name),
    slug = v_slug,
    email = NULLIF(trim(COALESCE(p_email, '')), ''),
    phone = NULLIF(trim(COALESCE(p_phone, '')), ''),
    description = NULLIF(trim(COALESCE(p_description, '')), '')
  WHERE id = p_store_id;

  PERFORM public._log_platform_action(
    p_store_id,
    'platform.update_tenant',
    jsonb_build_object('slug', v_slug, 'name', trim(p_name))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_tenant(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_tenant(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
