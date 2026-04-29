-- Preço promocional por período da semana (Seg-Qua vs Qui-Dom)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS has_weekday_promo BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_mon_wed NUMERIC,
  ADD COLUMN IF NOT EXISTS price_thu_sun NUMERIC;

COMMENT ON COLUMN public.products.has_weekday_promo IS
  'Quando true, aplica preço alternado por período da semana.';
COMMENT ON COLUMN public.products.price_mon_wed IS
  'Preço aplicado de segunda até quarta.';
COMMENT ON COLUMN public.products.price_thu_sun IS
  'Preço aplicado de quinta até domingo.';










  
