-- FIX COMPLETO: Vincula tudo à loja default e garante que aparece para o cliente

DO $$
DECLARE
  default_store_id UUID;
  active_basket_id UUID;
BEGIN
  -- 1. Pega o ID da loja default
  SELECT id INTO default_store_id FROM public.stores WHERE slug = 'default' LIMIT 1;
  
  IF default_store_id IS NULL THEN
    -- Cria a loja default se não existir
    INSERT INTO public.stores (name, slug, description, active)
    VALUES ('HortiDelivery Lite', 'default', 'Hortifruti fresquinho na sua porta', true)
    RETURNING id INTO default_store_id;
    RAISE NOTICE 'Loja default criada: %', default_store_id;
  ELSE
    RAISE NOTICE 'Loja default encontrada: %', default_store_id;
  END IF;

  -- 2. Vincula todos os produtos sem store_id à loja default
  UPDATE public.products SET store_id = default_store_id WHERE store_id IS NULL;
  RAISE NOTICE 'Produtos vinculados: %', (SELECT COUNT(*) FROM public.products WHERE store_id = default_store_id);

  -- 3. Vincula todas as cestas sem store_id à loja default
  UPDATE public.baskets SET store_id = default_store_id WHERE store_id IS NULL;
  RAISE NOTICE 'Cestas vinculadas: %', (SELECT COUNT(*) FROM public.baskets WHERE store_id = default_store_id);

  -- 4. Garante que existe pelo menos uma cesta ativa
  SELECT id INTO active_basket_id 
  FROM public.baskets 
  WHERE store_id = default_store_id AND active = true 
  LIMIT 1;

  IF active_basket_id IS NULL THEN
    -- Ativa a primeira cesta disponível
    UPDATE public.baskets 
    SET active = true 
    WHERE store_id = default_store_id
    AND id = (SELECT id FROM public.baskets WHERE store_id = default_store_id ORDER BY created_at LIMIT 1)
    RETURNING id INTO active_basket_id;
    RAISE NOTICE 'Cesta ativada: %', active_basket_id;
  ELSE
    RAISE NOTICE 'Cesta ativa encontrada: %', active_basket_id;
  END IF;

  -- 5. Se ainda não tem cesta, cria uma nova com todos os produtos
  IF active_basket_id IS NULL THEN
    INSERT INTO public.baskets (name, price, active, store_id)
    VALUES ('Cesta da Semana', 0, true, default_store_id)
    RETURNING id INTO active_basket_id;
    RAISE NOTICE 'Nova cesta criada: %', active_basket_id;
  END IF;

  -- 6. Adiciona à cesta todos os produtos que ainda não estão nela
  INSERT INTO public.basket_items (basket_id, product_id, quantity)
  SELECT active_basket_id, p.id, 1
  FROM public.products p
  WHERE p.store_id = default_store_id
    AND p.active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.basket_items bi 
      WHERE bi.basket_id = active_basket_id AND bi.product_id = p.id
    );

  RAISE NOTICE 'Itens na cesta ativa: %', (
    SELECT COUNT(*) FROM public.basket_items WHERE basket_id = active_basket_id
  );

  -- 7. Garante que todos os produtos estão ativos
  UPDATE public.products SET active = true WHERE store_id = default_store_id AND active = false;

END $$;

-- RESULTADO FINAL: mostra o que o cliente vai ver
SELECT 
  s.slug as loja,
  b.name as cesta,
  b.active as cesta_ativa,
  p.name as produto,
  p.price as preco,
  p.active as produto_ativo,
  p.store_id IS NOT NULL as tem_store_id
FROM public.stores s
JOIN public.baskets b ON b.store_id = s.id AND b.active = true
JOIN public.basket_items bi ON bi.basket_id = b.id
JOIN public.products p ON p.id = bi.product_id
WHERE s.slug = 'default'
ORDER BY p.name;
