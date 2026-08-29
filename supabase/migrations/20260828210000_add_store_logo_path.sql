-- Logomarca dinâmica por loja (logo_path + bucket store-logos)

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS logo_path TEXT;

COMMENT ON COLUMN public.stores.logo_path IS
  'Path no bucket store-logos (ex: logos/{store_id}/logo.png). Não armazena URL.';

-- CREATE OR REPLACE não permite inserir coluna no meio da view; recriar explicitamente.
DROP VIEW IF EXISTS public.stores_public;

CREATE VIEW public.stores_public AS
  SELECT id, name, slug, description, logo_url, logo_path, phone, email, address,
         active, subscription_status, created_at
  FROM public.stores;

GRANT SELECT ON public.stores_public TO anon, authenticated;

-- Bucket público exclusivo para logos (sem dados sensíveis)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'store-logos',
  'store-logos',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS store_logos_owner_insert ON storage.objects;
CREATE POLICY store_logos_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'store-logos'
    AND (storage.foldername(name))[1] = 'logos'
    AND public.is_store_owner(((storage.foldername(name))[2])::uuid)
  );

DROP POLICY IF EXISTS store_logos_owner_update ON storage.objects;
CREATE POLICY store_logos_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'store-logos'
    AND (storage.foldername(name))[1] = 'logos'
    AND public.is_store_owner(((storage.foldername(name))[2])::uuid)
  )
  WITH CHECK (
    bucket_id = 'store-logos'
    AND (storage.foldername(name))[1] = 'logos'
    AND public.is_store_owner(((storage.foldername(name))[2])::uuid)
  );

DROP POLICY IF EXISTS store_logos_owner_delete ON storage.objects;
CREATE POLICY store_logos_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'store-logos'
    AND (storage.foldername(name))[1] = 'logos'
    AND public.is_store_owner(((storage.foldername(name))[2])::uuid)
  );

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

  SELECT id INTO v_store_id FROM public.stores WHERE user_id = auth.uid();
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

REVOKE ALL ON FUNCTION public.update_store_logo_path(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_store_logo_path(TEXT) TO authenticated;
