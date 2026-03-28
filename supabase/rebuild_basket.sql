-- Limpa basket_items e reconstrói com produtos válidos

-- 1. Remove todos os itens da cesta ativa
DELETE FROM public.basket_items
WHERE basket_id = (SELECT id FROM public.baskets WHERE active = true LIMIT 1);

-- 2. Adiciona todos os produtos válidos
INSERT INTO public.basket_items (basket_id, product_id, quantity)
SELECT 
  (SELECT id FROM public.baskets WHERE active = true LIMIT 1),
  p.id,
  1
FROM public.products p
WHERE p.active = true
  AND p.price > 0
  AND length(p.name) <= 100
  AND p.name NOT LIKE '%PK%'
  AND p.name NOT LIKE '%xml%';

-- 3. Confirma
SELECT p.name, p.price
FROM public.basket_items bi
JOIN public.products p ON p.id = bi.product_id
JOIN public.baskets b ON b.id = bi.basket_id
WHERE b.active = true
ORDER BY p.name;
