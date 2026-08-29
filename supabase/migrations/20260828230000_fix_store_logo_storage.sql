-- Corrige upload/leitura de logomarcas no bucket store-logos

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'store-logos',
  'store-logos',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.store_logo_object_owned(p_object_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(p_object_name, '') ~ '^logos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    AND (
      public.is_store_owner(substring(p_object_name from '^logos/([^/]+)/')::uuid)
      OR public.is_platform_admin()
    );
$$;

REVOKE ALL ON FUNCTION public.store_logo_object_owned(TEXT) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS store_logos_public_select ON storage.objects;
CREATE POLICY store_logos_public_select ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'store-logos');

DROP POLICY IF EXISTS store_logos_owner_insert ON storage.objects;
CREATE POLICY store_logos_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'store-logos'
    AND public.store_logo_object_owned(name)
  );

DROP POLICY IF EXISTS store_logos_owner_update ON storage.objects;
CREATE POLICY store_logos_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'store-logos'
    AND public.store_logo_object_owned(name)
  )
  WITH CHECK (
    bucket_id = 'store-logos'
    AND public.store_logo_object_owned(name)
  );

DROP POLICY IF EXISTS store_logos_owner_delete ON storage.objects;
CREATE POLICY store_logos_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'store-logos'
    AND public.store_logo_object_owned(name)
  );
