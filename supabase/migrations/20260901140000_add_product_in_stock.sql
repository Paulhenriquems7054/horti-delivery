-- Disponibilidade no catálogo do cliente (false = indisponível para compra)

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS in_stock BOOLEAN DEFAULT true;

COMMENT ON COLUMN public.products.in_stock IS
  'Disponível no catálogo do cliente. false = indisponível (visível, sem adicionar ao carrinho).';

UPDATE public.products SET in_stock = true WHERE in_stock IS NULL;
