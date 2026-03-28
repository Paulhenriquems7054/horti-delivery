-- Adiciona todos os produtos ativos à cesta ativa da loja default

INSERT INTO public.basket_items (basket_id, product_id, quantity)
SELECT 
  b.id as basket_id,
  p.id as product_id,
  1 as quantity
FROM public.baskets b
JOIN public.stores s ON s.id = b.store_id
CROSS JOIN public.products p
WHERE s.slug = 'default'
  AND b.active = true
  AND p.active = true
  AND p.store_id = s.id
  AND NOT EXISTS (
    SELECT 1 FROM public.basket_items bi 
    WHERE bi.basket_id = b.id AND bi.product_id = p.id
  );

-- Confirma o resultado
SELECT COUNT(*) as itens_adicionados FROM public.basket_items bi
JOIN public.baskets b ON b.id = bi.basket_id
JOIN public.stores s ON s.id = b.store_id
WHERE s.slug = 'default' AND b.active = true;
