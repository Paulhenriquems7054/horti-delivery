-- SOMENTE LEITURA — exportar snapshot Beira Rio para dry-run local.
-- Cole no SQL Editor e baixe o JSON (ou copie o resultado).
-- NÃO executa UPDATE/INSERT/DELETE.

-- 1) Confirme distribuição (já conhecida)
SELECT COALESCE(c.name, 'NULL') AS categoria, COUNT(*) AS qtd
FROM products p
JOIN stores s ON s.id = p.store_id
LEFT JOIN categories c ON c.id = p.category_id
WHERE s.slug = 'beira-rio' AND p.active = true
GROUP BY COALESCE(c.name, 'NULL')
ORDER BY qtd DESC;

-- 2) Snapshot de produtos (cole em scripts/beira-rio-db-snapshot.json)
-- Formato esperado pelo script:
-- {
--   "store": { "id": "...", "slug": "beira-rio" },
--   "categories": [ { "id", "store_id", "name", "active" } ],
--   "products": [ { "id", "internal_code", "barcode", "category_id", "active" } ]
-- }

SELECT jsonb_build_object(
  'fetched_at', now(),
  'mode', 'sql_editor_export',
  'store', (
    SELECT jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.name, 'active', s.active)
    FROM stores s WHERE s.slug = 'beira-rio' LIMIT 1
  ),
  'categories', (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'store_id', c.store_id,
        'name', c.name,
        'active', c.active,
        'sort_order', c.sort_order
      ) ORDER BY c.sort_order
    ), '[]'::jsonb)
    FROM categories c
    JOIN stores s ON s.id = c.store_id
    WHERE s.slug = 'beira-rio' AND c.active = true
  ),
  'products', (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'internal_code', p.internal_code,
        'barcode', p.barcode,
        'category_id', p.category_id,
        'active', p.active
      ) ORDER BY p.internal_code
    ), '[]'::jsonb)
    FROM products p
    JOIN stores s ON s.id = p.store_id
    WHERE s.slug = 'beira-rio' AND p.active = true
  )
) AS snapshot;
