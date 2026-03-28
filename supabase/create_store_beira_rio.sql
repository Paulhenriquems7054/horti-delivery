-- Cria a loja beira-rio e vincula ao usuário admin existente

-- 1. Cria a loja
INSERT INTO public.stores (name, slug, description, active)
VALUES ('Hortifruti Beira Rio', 'beira-rio', 'Produtos frescos direto para você', true)
ON CONFLICT (slug) DO UPDATE SET active = true;

-- 2. Vincula ao primeiro usuário admin (se existir)
UPDATE public.stores
SET user_id = (SELECT id FROM auth.users LIMIT 1)
WHERE slug = 'beira-rio' AND user_id IS NULL;

-- 3. Cria uma cesta ativa para essa loja
INSERT INTO public.baskets (name, price, active, store_id)
SELECT 'Cesta da Semana', 0, true, id
FROM public.stores
WHERE slug = 'beira-rio'
  AND NOT EXISTS (
    SELECT 1 FROM public.baskets b WHERE b.store_id = stores.id
  );

-- 4. Adiciona todos os produtos ativos à cesta
INSERT INTO public.basket_items (basket_id, product_id, quantity)
SELECT b.id, p.id, 1
FROM public.baskets b
JOIN public.stores s ON s.id = b.store_id
CROSS JOIN public.products p
WHERE s.slug = 'beira-rio'
  AND b.active = true
  AND p.active = true
  AND p.price > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.basket_items bi WHERE bi.basket_id = b.id AND bi.product_id = p.id
  );

-- 5. Confirma
SELECT s.slug, b.name as cesta, b.active, COUNT(bi.id) as produtos
FROM public.stores s
JOIN public.baskets b ON b.store_id = s.id
LEFT JOIN public.basket_items bi ON bi.basket_id = b.id
WHERE s.slug = 'beira-rio'
GROUP BY s.slug, b.name, b.active;
