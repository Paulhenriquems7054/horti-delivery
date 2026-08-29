-- Hotfix: upload de logo — remove dependência de EXECUTE em store_logo_object_owned
-- Usa is_store_owner inline (mesmo padrão de order-receipts)

GRANT EXECUTE ON FUNCTION public.store_logo_object_owned(TEXT) TO authenticated, anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_my_store() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_store_id() TO authenticated;

DROP POLICY IF EXISTS store_logos_public_select ON storage.objects;
CREATE POLICY store_logos_public_select ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'store-logos');

DROP POLICY IF EXISTS store_logos_owner_insert ON storage.objects;
CREATE POLICY store_logos_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'store-logos'
    AND (storage.foldername(name))[1] = 'logos'
    AND (
      public.is_store_owner(((storage.foldername(name))[2])::uuid)
      OR public.is_platform_admin()
    )
  );

DROP POLICY IF EXISTS store_logos_owner_update ON storage.objects;
CREATE POLICY store_logos_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'store-logos'
    AND (storage.foldername(name))[1] = 'logos'
    AND (
      public.is_store_owner(((storage.foldername(name))[2])::uuid)
      OR public.is_platform_admin()
    )
  )
  WITH CHECK (
    bucket_id = 'store-logos'
    AND (storage.foldername(name))[1] = 'logos'
    AND (
      public.is_store_owner(((storage.foldername(name))[2])::uuid)
      OR public.is_platform_admin()
    )
  );

DROP POLICY IF EXISTS store_logos_owner_delete ON storage.objects;
CREATE POLICY store_logos_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'store-logos'
    AND (storage.foldername(name))[1] = 'logos'
    AND (
      public.is_store_owner(((storage.foldername(name))[2])::uuid)
      OR public.is_platform_admin()
    )
  );
