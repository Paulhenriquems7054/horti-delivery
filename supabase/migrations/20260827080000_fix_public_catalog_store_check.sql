-- O EXISTS em public.stores nas policies públicas falha para anon:
-- anon não tem GRANT SELECT em stores (2B). Resultado: 42501
-- "permission denied for table stores" na vitrine.
-- Checagem de loja aberta via função SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.store_is_publicly_open(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.stores s
    WHERE s.id = p_store_id
      AND s.active = true
      AND COALESCE(s.subscription_status, '') <> 'blocked'
  );
$$;

REVOKE ALL ON FUNCTION public.store_is_publicly_open(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.store_is_publicly_open(UUID) TO anon, authenticated;

DROP POLICY IF EXISTS products_public_read ON public.products;
CREATE POLICY products_public_read ON public.products
  FOR SELECT
  USING (
    active = true
    AND store_id IS NOT NULL
    AND public.store_is_publicly_open(store_id)
  );

DROP POLICY IF EXISTS baskets_public_read ON public.baskets;
CREATE POLICY baskets_public_read ON public.baskets
  FOR SELECT
  USING (
    active = true
    AND store_id IS NOT NULL
    AND public.store_is_publicly_open(store_id)
  );

DROP POLICY IF EXISTS basket_items_public_read ON public.basket_items;
CREATE POLICY basket_items_public_read ON public.basket_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.baskets b
      WHERE b.id = basket_items.basket_id
        AND b.active = true
        AND b.store_id IS NOT NULL
        AND public.store_is_publicly_open(b.store_id)
    )
  );

DROP POLICY IF EXISTS categories_public_read ON public.categories;
CREATE POLICY categories_public_read ON public.categories
  FOR SELECT
  USING (
    active = true
    AND store_id IS NOT NULL
    AND public.store_is_publicly_open(store_id)
  );
