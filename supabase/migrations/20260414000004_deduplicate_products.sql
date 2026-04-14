-- Deduplica produtos por loja/nome e evita novas duplicatas
WITH ranked AS (
  SELECT
    id,
    store_id,
    LOWER(name) AS name_key,
    ROW_NUMBER() OVER (
      PARTITION BY store_id, LOWER(name)
      ORDER BY (in_stock IS NOT FALSE) DESC, id
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY store_id, LOWER(name)
      ORDER BY (in_stock IS NOT FALSE) DESC, id
    ) AS canonical_id
  FROM public.products
)
UPDATE public.basket_items bi
SET product_id = r.canonical_id
FROM ranked r
WHERE bi.product_id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    id,
    store_id,
    LOWER(name) AS name_key,
    ROW_NUMBER() OVER (
      PARTITION BY store_id, LOWER(name)
      ORDER BY (in_stock IS NOT FALSE) DESC, id
    ) AS rn
  FROM public.products
)
UPDATE public.products p
SET active = false,
    in_stock = false
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

-- Garante unicidade apenas para produtos ativos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_products_unique_active_name'
  ) THEN
    CREATE UNIQUE INDEX idx_products_unique_active_name
      ON public.products (store_id, LOWER(name))
      WHERE active = true;
  END IF;
END $$;
