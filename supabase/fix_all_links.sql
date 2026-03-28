-- Fix completo sem PL/pgSQL - sem ambiguidade de variáveis

-- 1. Vincula todos os produtos sem store_id à loja default
UPDATE public.products
SET store_id = (SELECT id FROM public.stores WHERE slug = 'default' LIMIT 1)
WHERE store_id IS NULL;

-- 2. Vincula todas as cestas sem store_id à loja default
UPDATE public.baskets
SET store_id = (SELECT id FROM public.stores WHERE slug = 'default' LIMIT 1)
WHERE store_id IS NULL;

-- 3. Adiciona todos os produtos ativos à cesta ativa (sem duplicar)
INSERT INTO public.basket_items (basket_id, product_id, quantity)
SELECT 
  (SELECT id FROM public.baskets WHERE active = true LIMIT 1),
  p.id,
  1
FROM public.products p
WHERE p.active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.basket_items bi
    WHERE bi.basket_id = (SELECT id FROM public.baskets WHERE active = true LIMIT 1)
      AND bi.product_id = p.id
  );

-- 4. Resultado final
SELECT 
  p.name,
  p.price,
  p.active,
  p.store_id IS NOT NULL as tem_store
FROM public.basket_items bi
JOIN public.products p ON p.id = bi.product_id
JOIN public.baskets b ON b.id = bi.basket_id
WHERE b.active = true
ORDER BY p.name;
