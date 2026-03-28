-- DIAGNÓSTICO COMPLETO - Execute e cole o resultado

-- 1. Lojas
SELECT 'LOJAS' as tipo, id::text, name, slug, active::text as active FROM public.stores;

-- 2. Cestas
SELECT 'CESTAS' as tipo, id::text, name, active::text, COALESCE(store_id::text, 'NULL') as store_id FROM public.baskets;

-- 3. Produtos (primeiros 10)
SELECT 'PRODUTOS' as tipo, id::text, name, active::text, COALESCE(store_id::text, 'NULL') as store_id FROM public.products LIMIT 10;

-- 4. Itens da cesta
SELECT 'BASKET_ITEMS' as tipo, bi.basket_id::text, bi.product_id::text, p.name, p.active::text
FROM public.basket_items bi 
JOIN public.products p ON p.id = bi.product_id;

-- 5. Relação loja -> cesta -> itens
SELECT 
  s.slug,
  b.name as cesta,
  b.active as cesta_ativa,
  COUNT(bi.id) as total_itens
FROM public.stores s
LEFT JOIN public.baskets b ON b.store_id = s.id
LEFT JOIN public.basket_items bi ON bi.basket_id = b.id
GROUP BY s.slug, b.name, b.active;
