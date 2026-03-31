-- Direct delivery orders (in-store purchase with delivery)
CREATE TABLE IF NOT EXISTS public.direct_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  total_purchase NUMERIC NOT NULL DEFAULT 0,
  delivery_fee NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending_fee'
    CHECK (status IN ('pending_fee','awaiting_approval','approved','delivering','delivered','cancelled')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  approved_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.direct_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public all direct_deliveries" ON public.direct_deliveries FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_direct_deliveries_store ON public.direct_deliveries(store_id);
CREATE INDEX IF NOT EXISTS idx_direct_deliveries_phone ON public.direct_deliveries(phone);
CREATE INDEX IF NOT EXISTS idx_direct_deliveries_status ON public.direct_deliveries(status);

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_deliveries;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
