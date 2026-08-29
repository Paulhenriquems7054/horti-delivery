-- stores_public: expor updated_at para cache-bust da logo na vitrine

DROP VIEW IF EXISTS public.stores_public;

CREATE VIEW public.stores_public AS
  SELECT id, name, slug, description, logo_url, logo_path, phone, email, address,
         active, subscription_status, created_at, updated_at
  FROM public.stores;

GRANT SELECT ON public.stores_public TO anon, authenticated;

-- Bucket: até 5 MB por logo (1024×1024 PNG)
UPDATE storage.buckets
SET file_size_limit = 5242880
WHERE id = 'store-logos';
