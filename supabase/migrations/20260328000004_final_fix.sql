-- Final Fix Migration - Execute this one!
-- This migration fixes all issues and is completely idempotent

-- 1. DROP AND RECREATE STORES TABLE (safest approach)
DROP TABLE IF EXISTS public.stores CASCADE;

CREATE TABLE public.stores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  logo_url TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. RECREATE DEPENDENT TABLES
DROP TABLE IF EXISTS public.delivery_zones CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.coupons CASCADE;

CREATE TABLE public.delivery_zones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  fee NUMERIC NOT NULL DEFAULT 0,
  min_order NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.coupons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC NOT NULL,
  min_order NUMERIC DEFAULT 0,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. CREATE OTHER NEW TABLES
CREATE TABLE IF NOT EXISTS public.favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_phone TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(customer_phone, product_id)
);

CREATE TABLE IF NOT EXISTS public.order_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. ADD COLUMNS TO EXISTING TABLES
DO $$ 
BEGIN
  -- Products
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='store_id') THEN
    ALTER TABLE public.products ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='category_id') THEN
    ALTER TABLE public.products ADD COLUMN category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='description') THEN
    ALTER TABLE public.products ADD COLUMN description TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='unit') THEN
    ALTER TABLE public.products ADD COLUMN unit TEXT DEFAULT 'kg';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='stock') THEN
    ALTER TABLE public.products ADD COLUMN stock INTEGER;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='featured') THEN
    ALTER TABLE public.products ADD COLUMN featured BOOLEAN DEFAULT false;
  END IF;

  -- Baskets
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='baskets' AND column_name='store_id') THEN
    ALTER TABLE public.baskets ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='baskets' AND column_name='description') THEN
    ALTER TABLE public.baskets ADD COLUMN description TEXT;
  END IF;

  -- Orders
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='store_id') THEN
    ALTER TABLE public.orders ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='delivery_zone_id') THEN
    ALTER TABLE public.orders ADD COLUMN delivery_zone_id UUID REFERENCES public.delivery_zones(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='coupon_id') THEN
    ALTER TABLE public.orders ADD COLUMN coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='delivery_fee') THEN
    ALTER TABLE public.orders ADD COLUMN delivery_fee NUMERIC DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='discount') THEN
    ALTER TABLE public.orders ADD COLUMN discount NUMERIC DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='notes') THEN
    ALTER TABLE public.orders ADD COLUMN notes TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='email') THEN
    ALTER TABLE public.orders ADD COLUMN email TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='cancelled_at') THEN
    ALTER TABLE public.orders ADD COLUMN cancelled_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='cancelled_reason') THEN
    ALTER TABLE public.orders ADD COLUMN cancelled_reason TEXT;
  END IF;

  -- Order Items
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='price') THEN
    ALTER TABLE public.order_items ADD COLUMN price NUMERIC;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='product_name') THEN
    ALTER TABLE public.order_items ADD COLUMN product_name TEXT;
  END IF;
END $$;

-- 5. ENABLE RLS
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_tracking ENABLE ROW LEVEL SECURITY;

-- 6. CREATE POLICIES
DROP POLICY IF EXISTS "Anyone can read stores" ON public.stores;
CREATE POLICY "Anyone can read stores" ON public.stores FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert stores" ON public.stores;
CREATE POLICY "Anyone can insert stores" ON public.stores FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update stores" ON public.stores;
CREATE POLICY "Anyone can update stores" ON public.stores FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Anyone can delete stores" ON public.stores;
CREATE POLICY "Anyone can delete stores" ON public.stores FOR DELETE USING (true);

DROP POLICY IF EXISTS "Anyone can read delivery_zones" ON public.delivery_zones;
CREATE POLICY "Anyone can read delivery_zones" ON public.delivery_zones FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert delivery_zones" ON public.delivery_zones;
CREATE POLICY "Anyone can insert delivery_zones" ON public.delivery_zones FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update delivery_zones" ON public.delivery_zones;
CREATE POLICY "Anyone can update delivery_zones" ON public.delivery_zones FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Anyone can delete delivery_zones" ON public.delivery_zones;
CREATE POLICY "Anyone can delete delivery_zones" ON public.delivery_zones FOR DELETE USING (true);

DROP POLICY IF EXISTS "Anyone can read categories" ON public.categories;
CREATE POLICY "Anyone can read categories" ON public.categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert categories" ON public.categories;
CREATE POLICY "Anyone can insert categories" ON public.categories FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update categories" ON public.categories;
CREATE POLICY "Anyone can update categories" ON public.categories FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Anyone can delete categories" ON public.categories;
CREATE POLICY "Anyone can delete categories" ON public.categories FOR DELETE USING (true);

DROP POLICY IF EXISTS "Anyone can read coupons" ON public.coupons;
CREATE POLICY "Anyone can read coupons" ON public.coupons FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert coupons" ON public.coupons;
CREATE POLICY "Anyone can insert coupons" ON public.coupons FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update coupons" ON public.coupons;
CREATE POLICY "Anyone can update coupons" ON public.coupons FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Anyone can delete coupons" ON public.coupons;
CREATE POLICY "Anyone can delete coupons" ON public.coupons FOR DELETE USING (true);

DROP POLICY IF EXISTS "Anyone can read favorites" ON public.favorites;
CREATE POLICY "Anyone can read favorites" ON public.favorites FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert favorites" ON public.favorites;
CREATE POLICY "Anyone can insert favorites" ON public.favorites FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can delete favorites" ON public.favorites;
CREATE POLICY "Anyone can delete favorites" ON public.favorites FOR DELETE USING (true);

DROP POLICY IF EXISTS "Anyone can read order_tracking" ON public.order_tracking;
CREATE POLICY "Anyone can read order_tracking" ON public.order_tracking FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert order_tracking" ON public.order_tracking;
CREATE POLICY "Anyone can insert order_tracking" ON public.order_tracking FOR INSERT WITH CHECK (true);

-- 7. CREATE INDEXES
CREATE INDEX IF NOT EXISTS idx_products_store_id ON public.products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(active);
CREATE INDEX IF NOT EXISTS idx_baskets_store_id ON public.baskets(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON public.orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON public.orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_store_id ON public.delivery_zones(store_id);
CREATE INDEX IF NOT EXISTS idx_favorites_phone ON public.favorites(customer_phone);
CREATE INDEX IF NOT EXISTS idx_order_tracking_order_id ON public.order_tracking(order_id);

-- 8. ENABLE REALTIME
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.order_tracking;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 9. CREATE RPC FUNCTION
CREATE OR REPLACE FUNCTION increment_coupon_usage(coupon_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.coupons
  SET used_count = used_count + 1
  WHERE id = coupon_id;
END;
$$;

-- 10. INSERT DEFAULT STORE
INSERT INTO public.stores (name, slug, description, active)
VALUES ('HortiDelivery Lite', 'default', 'Hortifruti fresquinho na sua porta', true)
ON CONFLICT (slug) DO NOTHING;

-- 11. UPDATE EXISTING DATA
DO $$
DECLARE
  default_store_id UUID;
BEGIN
  SELECT id INTO default_store_id FROM public.stores WHERE slug = 'default' LIMIT 1;
  
  IF default_store_id IS NOT NULL THEN
    UPDATE public.products SET store_id = default_store_id WHERE store_id IS NULL;
    UPDATE public.baskets SET store_id = default_store_id WHERE store_id IS NULL;
    UPDATE public.orders SET store_id = default_store_id WHERE store_id IS NULL;
  END IF;
END $$;

-- Success!
DO $$
BEGIN
  RAISE NOTICE '✅ Migration completed successfully!';
  RAISE NOTICE '📦 Tables created: stores, delivery_zones, categories, coupons, favorites, order_tracking';
  RAISE NOTICE '🔧 Existing tables updated with new columns';
  RAISE NOTICE '🏪 Default store created: /default';
  RAISE NOTICE '🎉 Ready to use!';
END $$;
