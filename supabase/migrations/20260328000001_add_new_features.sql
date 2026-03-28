-- Migration: Add new features (stores, delivery zones, coupons, categories, favorites, order tracking)

-- 1. STORES TABLE (Multi-tenant support)
CREATE TABLE IF NOT EXISTS public.stores (
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

-- 2. DELIVERY ZONES TABLE
CREATE TABLE IF NOT EXISTS public.delivery_zones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  fee NUMERIC NOT NULL DEFAULT 0,
  min_order NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. PRODUCT CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. COUPONS TABLE
CREATE TABLE IF NOT EXISTS public.coupons (
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

-- 5. FAVORITES TABLE
CREATE TABLE IF NOT EXISTS public.favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_phone TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(customer_phone, product_id)
);

-- 6. ORDER TRACKING TABLE
CREATE TABLE IF NOT EXISTS public.order_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 7. ALTER EXISTING TABLES

-- Add store_id to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'kg';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock INTEGER;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false;

-- Add store_id to baskets
ALTER TABLE public.baskets ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.baskets ADD COLUMN IF NOT EXISTS description TEXT;

-- Add more fields to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_zone_id UUID REFERENCES public.delivery_zones(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount NUMERIC DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;

-- Add price to order_items (for historical tracking)
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS price NUMERIC;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS product_name TEXT;

-- 8. ENABLE RLS
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_tracking ENABLE ROW LEVEL SECURITY;

-- 9. RLS POLICIES (Public access for MVP)
CREATE POLICY "Anyone can read stores" ON public.stores FOR SELECT USING (true);
CREATE POLICY "Anyone can insert stores" ON public.stores FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update stores" ON public.stores FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete stores" ON public.stores FOR DELETE USING (true);

CREATE POLICY "Anyone can read delivery_zones" ON public.delivery_zones FOR SELECT USING (true);
CREATE POLICY "Anyone can insert delivery_zones" ON public.delivery_zones FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update delivery_zones" ON public.delivery_zones FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete delivery_zones" ON public.delivery_zones FOR DELETE USING (true);

CREATE POLICY "Anyone can read categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Anyone can insert categories" ON public.categories FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update categories" ON public.categories FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete categories" ON public.categories FOR DELETE USING (true);

CREATE POLICY "Anyone can read coupons" ON public.coupons FOR SELECT USING (true);
CREATE POLICY "Anyone can insert coupons" ON public.coupons FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update coupons" ON public.coupons FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete coupons" ON public.coupons FOR DELETE USING (true);

CREATE POLICY "Anyone can read favorites" ON public.favorites FOR SELECT USING (true);
CREATE POLICY "Anyone can insert favorites" ON public.favorites FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete favorites" ON public.favorites FOR DELETE USING (true);

CREATE POLICY "Anyone can read order_tracking" ON public.order_tracking FOR SELECT USING (true);
CREATE POLICY "Anyone can insert order_tracking" ON public.order_tracking FOR INSERT WITH CHECK (true);

-- 10. INDEXES for performance
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

-- 11. ENABLE REALTIME for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_tracking;

-- 12. CREATE DEFAULT STORE (for existing data)
INSERT INTO public.stores (name, slug, description, active)
VALUES ('HortiDelivery Lite', 'default', 'Hortifruti fresquinho na sua porta', true)
ON CONFLICT (slug) DO NOTHING;

-- 13. UPDATE existing data to link to default store
UPDATE public.products SET store_id = (SELECT id FROM public.stores WHERE slug = 'default' LIMIT 1)
WHERE store_id IS NULL;

UPDATE public.baskets SET store_id = (SELECT id FROM public.stores WHERE slug = 'default' LIMIT 1)
WHERE store_id IS NULL;

UPDATE public.orders SET store_id = (SELECT id FROM public.stores WHERE slug = 'default' LIMIT 1)
WHERE store_id IS NULL;
