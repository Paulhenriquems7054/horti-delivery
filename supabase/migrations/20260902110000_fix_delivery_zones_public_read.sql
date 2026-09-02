-- Corrige leitura pública de zonas de entrega (política antiga consultava stores, bloqueada para anon)

DROP POLICY IF EXISTS zones_public_read ON public.delivery_zones;

CREATE POLICY zones_public_read ON public.delivery_zones
  FOR SELECT
  USING (
    active = true
    AND store_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.stores_public s
      WHERE s.id = delivery_zones.store_id
        AND s.active = true
    )
  );
