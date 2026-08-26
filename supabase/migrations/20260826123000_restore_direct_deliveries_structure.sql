-- Recover public.direct_deliveries structure only.
-- Intermediate state: RLS enabled, no policies, no anon grants, no realtime.
-- Isolation policies remain in 20260826120000_enforce_multitenant_rls.sql
-- Does not edit historical 20260328000010_add_direct_delivery.sql

CREATE TABLE IF NOT EXISTS public.direct_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  total_purchase NUMERIC NOT NULL DEFAULT 0,
  delivery_fee NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending_fee'
    CHECK (status IN (
      'pending_fee',
      'awaiting_approval',
      'approved',
      'delivering',
      'delivered',
      'cancelled'
    )),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ
);

ALTER TABLE public.direct_deliveries ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_direct_deliveries_store_id
  ON public.direct_deliveries (store_id);

CREATE INDEX IF NOT EXISTS idx_direct_deliveries_phone
  ON public.direct_deliveries (phone);

CREATE INDEX IF NOT EXISTS idx_direct_deliveries_status
  ON public.direct_deliveries (status);
