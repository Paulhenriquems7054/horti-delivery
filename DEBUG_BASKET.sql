-- Execute no SQL Editor do Supabase para diagnosticar o problema

-- 1. Ver todas as lojas
SELECT id, name, slug, active, store_id FROM public.stores;

-- 2. Ver todas as cestas
SELECT id, name, active, store_id FROM public.baskets;

-- 3. Ver todos os produtos
SELECT id, name, active, store_id FROM public.products;

-- 4. Ver itens das cestas
SELECT bi.id, bi.basket_id, bi.product_id, bi.quantity, p.name as product_name
FROM public.basket_items bi
JOIN public.products p ON p.id = bi.product_id;

-- 5. Verificar se a loja 'default' tem cesta ativa
SELECT 
  s.slug,
  s.id as store_id,
  b.id as basket_id,
  b.name as basket_name,
  b.active as basket_active,
  b.store_id as basket_store_id
FROM public.stores s
LEFT JOIN public.baskets b ON b.store_id = s.id
WHERE s.slug = 'default';
