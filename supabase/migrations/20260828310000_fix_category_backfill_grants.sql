-- Corrige grants da RPC de backfill: PostgreSQL concede EXECUTE a PUBLIC por padrão.
-- Padrão do projeto: REVOKE PUBLIC + anon, GRANT somente authenticated.

REVOKE ALL ON FUNCTION public.backfill_product_categories_batch(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backfill_product_categories_batch(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.backfill_product_categories_batch(JSONB) TO authenticated;
