-- Bloqueio de loja deve esconder o catálogo público.
-- stores_public passa a devolver também lojas inativas/bloqueadas
-- (com active e subscription_status) para a vitrine mostrar a tela de bloqueio
-- em vez de "loja não encontrada".
-- NÃO aplicar automaticamente no Hosted.

CREATE OR REPLACE VIEW public.stores_public AS
  SELECT id, name, slug, description, logo_url, phone, email, address,
         active, subscription_status, created_at
  FROM public.stores;

GRANT SELECT ON public.stores_public TO anon, authenticated;

-- Catálogo público só se a LOJA estiver operacional e não bloqueada.
DROP POLICY IF EXISTS products_public_read ON public.products;
CREATE POLICY products_public_read ON public.products
  FOR SELECT
  USING (
    active = true
    AND store_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = products.store_id
        AND s.active = true
        AND COALESCE(s.subscription_status, '') <> 'blocked'
    )
  );

DROP POLICY IF EXISTS baskets_public_read ON public.baskets;
CREATE POLICY baskets_public_read ON public.baskets
  FOR SELECT
  USING (
    active = true
    AND store_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = baskets.store_id
        AND s.active = true
        AND COALESCE(s.subscription_status, '') <> 'blocked'
    )
  );

DROP POLICY IF EXISTS basket_items_public_read ON public.basket_items;
CREATE POLICY basket_items_public_read ON public.basket_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.baskets b
      JOIN public.stores s ON s.id = b.store_id
      WHERE b.id = basket_items.basket_id
        AND b.active = true
        AND b.store_id IS NOT NULL
        AND s.active = true
        AND COALESCE(s.subscription_status, '') <> 'blocked'
    )
  );

DROP POLICY IF EXISTS categories_public_read ON public.categories;
CREATE POLICY categories_public_read ON public.categories
  FOR SELECT
  USING (
    active = true
    AND store_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = categories.store_id
        AND s.active = true
        AND COALESCE(s.subscription_status, '') <> 'blocked'
    )
  );
