-- Fix: Link existing baskets and products to the default store

DO $$
DECLARE
  default_store_id UUID;
BEGIN
  -- Get default store ID
  SELECT id INTO default_store_id FROM public.stores WHERE slug = 'default' LIMIT 1;

  IF default_store_id IS NULL THEN
    RAISE EXCEPTION 'Default store not found! Run seed first.';
  END IF;

  RAISE NOTICE 'Default store ID: %', default_store_id;

  -- Link all orphan products to default store
  UPDATE public.products
  SET store_id = default_store_id
  WHERE store_id IS NULL;

  RAISE NOTICE 'Products updated: %', (SELECT COUNT(*) FROM public.products WHERE store_id = default_store_id);

  -- Link all orphan baskets to default store
  UPDATE public.baskets
  SET store_id = default_store_id
  WHERE store_id IS NULL;

  RAISE NOTICE 'Baskets updated: %', (SELECT COUNT(*) FROM public.baskets WHERE store_id = default_store_id);

  -- Make sure at least one basket is active for the default store
  -- If no active basket exists, activate the first one
  IF NOT EXISTS (
    SELECT 1 FROM public.baskets
    WHERE store_id = default_store_id AND active = true
  ) THEN
    UPDATE public.baskets
    SET active = true
    WHERE store_id = default_store_id
    AND id = (
      SELECT id FROM public.baskets
      WHERE store_id = default_store_id
      ORDER BY created_at ASC
      LIMIT 1
    );
    RAISE NOTICE 'Activated first basket for default store';
  END IF;

  -- If still no basket exists at all, create one with all products
  IF NOT EXISTS (SELECT 1 FROM public.baskets WHERE store_id = default_store_id) THEN
    INSERT INTO public.baskets (name, price, active, store_id)
    VALUES ('Cesta da Semana', 0, true, default_store_id);

    -- Add all active products to this basket
    INSERT INTO public.basket_items (basket_id, product_id, quantity)
    SELECT 
      (SELECT id FROM public.baskets WHERE store_id = default_store_id LIMIT 1),
      p.id,
      1
    FROM public.products p
    WHERE p.store_id = default_store_id AND p.active = true;

    RAISE NOTICE 'Created new basket with all products';
  END IF;

  -- Final check
  RAISE NOTICE '=== FINAL STATE ===';
  RAISE NOTICE 'Active baskets for default store: %', (
    SELECT COUNT(*) FROM public.baskets WHERE store_id = default_store_id AND active = true
  );
  RAISE NOTICE 'Products in active basket: %', (
    SELECT COUNT(*) FROM public.basket_items bi
    JOIN public.baskets b ON b.id = bi.basket_id
    WHERE b.store_id = default_store_id AND b.active = true
  );

END $$;

-- Show final state
SELECT 
  s.slug,
  b.name as basket_name,
  b.active,
  COUNT(bi.id) as total_items
FROM public.stores s
JOIN public.baskets b ON b.store_id = s.id
LEFT JOIN public.basket_items bi ON bi.basket_id = b.id
WHERE s.slug = 'default'
GROUP BY s.slug, b.name, b.active;
