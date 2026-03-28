-- Seed data for new features

-- 1. Insert default store (if not exists)
INSERT INTO public.stores (name, slug, description, phone, email, active)
VALUES 
  ('HortiDelivery Lite', 'default', 'Hortifruti fresquinho na sua porta', '(11) 99999-9999', 'contato@horti.com', true),
  ('Feira do João', 'feira-joao', 'Os melhores produtos da região', '(11) 98888-8888', 'joao@feira.com', true)
ON CONFLICT (slug) DO NOTHING;

-- 2. Get store IDs
DO $$
DECLARE
  default_store_id UUID;
  feira_store_id UUID;
BEGIN
  SELECT id INTO default_store_id FROM public.stores WHERE slug = 'default' LIMIT 1;
  SELECT id INTO feira_store_id FROM public.stores WHERE slug = 'feira-joao' LIMIT 1;

  -- 3. Insert delivery zones
  INSERT INTO public.delivery_zones (store_id, name, fee, min_order, active)
  VALUES 
    (default_store_id, 'Centro', 5.00, 20.00, true),
    (default_store_id, 'Zona Norte', 8.00, 25.00, true),
    (default_store_id, 'Zona Sul', 10.00, 30.00, true),
    (feira_store_id, 'Centro', 4.00, 15.00, true),
    (feira_store_id, 'Bairro Alto', 6.00, 20.00, true)
  ON CONFLICT DO NOTHING;

  -- 4. Insert categories
  INSERT INTO public.categories (store_id, name, description, icon, active)
  VALUES 
    (default_store_id, 'Frutas', 'Frutas frescas e selecionadas', '🍎', true),
    (default_store_id, 'Verduras', 'Verduras e folhas', '🥬', true),
    (default_store_id, 'Legumes', 'Legumes frescos', '🥕', true),
    (default_store_id, 'Orgânicos', 'Produtos orgânicos certificados', '🌱', true),
    (feira_store_id, 'Frutas', 'Frutas da estação', '🍊', true),
    (feira_store_id, 'Verduras', 'Verduras frescas', '🥗', true)
  ON CONFLICT DO NOTHING;

  -- 5. Insert coupons
  INSERT INTO public.coupons (store_id, code, discount_type, discount_value, min_order, max_uses, active, expires_at)
  VALUES 
    (default_store_id, 'BEMVINDO10', 'percentage', 10, 30.00, 100, true, NOW() + INTERVAL '30 days'),
    (default_store_id, 'PRIMEIRACOMPRA', 'fixed', 5.00, 20.00, 50, true, NOW() + INTERVAL '60 days'),
    (default_store_id, 'FRETEGRATIS', 'percentage', 100, 50.00, NULL, true, NOW() + INTERVAL '15 days'),
    (feira_store_id, 'DESCONTO15', 'percentage', 15, 25.00, 200, true, NOW() + INTERVAL '45 days')
  ON CONFLICT (code) DO NOTHING;

  -- 6. Update existing products with store_id and category
  UPDATE public.products 
  SET 
    store_id = default_store_id,
    description = CASE 
      WHEN name LIKE '%Banana%' THEN 'Banana nanica fresca e doce'
      WHEN name LIKE '%Tomate%' THEN 'Tomate italiano maduro e suculento'
      WHEN name LIKE '%Alface%' THEN 'Alface crespa fresquinha'
      WHEN name LIKE '%Batata%' THEN 'Batata inglesa de primeira'
      WHEN name LIKE '%Cebola%' THEN 'Cebola branca selecionada'
      ELSE 'Produto fresco e de qualidade'
    END,
    unit = 'kg',
    stock = 100,
    featured = CASE WHEN name LIKE '%Banana%' OR name LIKE '%Tomate%' THEN true ELSE false END
  WHERE store_id IS NULL;

  -- 7. Link products to categories
  UPDATE public.products p
  SET category_id = (
    SELECT c.id FROM public.categories c 
    WHERE c.store_id = p.store_id 
    AND (
      (p.name ILIKE '%banana%' OR p.name ILIKE '%maçã%' OR p.name ILIKE '%laranja%') AND c.name = 'Frutas'
      OR (p.name ILIKE '%alface%' OR p.name ILIKE '%couve%' OR p.name ILIKE '%rúcula%') AND c.name = 'Verduras'
      OR (p.name ILIKE '%tomate%' OR p.name ILIKE '%batata%' OR p.name ILIKE '%cebola%' OR p.name ILIKE '%cenoura%') AND c.name = 'Legumes'
    )
    LIMIT 1
  )
  WHERE category_id IS NULL;

END $$;

-- 8. Update existing orders with store_id
UPDATE public.orders 
SET store_id = (SELECT id FROM public.stores WHERE slug = 'default' LIMIT 1)
WHERE store_id IS NULL;

-- 9. Update existing baskets with store_id
UPDATE public.baskets 
SET store_id = (SELECT id FROM public.stores WHERE slug = 'default' LIMIT 1)
WHERE store_id IS NULL;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Seed data inserted successfully!';
  RAISE NOTICE 'Default coupons: BEMVINDO10 (10%% off), PRIMEIRACOMPRA (R$ 5 off), FRETEGRATIS (free delivery)';
END $$;
