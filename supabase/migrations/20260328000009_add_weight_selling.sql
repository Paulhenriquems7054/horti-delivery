-- Add weight selling support to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sell_by TEXT DEFAULT 'unit' CHECK (sell_by IN ('unit', 'weight'));
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price_per_kg NUMERIC;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_weight NUMERIC DEFAULT 0.25;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS step_weight NUMERIC DEFAULT 0.25;

-- Update existing products: hortifruti típicos → weight
UPDATE public.products SET
  sell_by = 'weight',
  price_per_kg = price,
  min_weight = 0.25,
  step_weight = 0.25
WHERE name ILIKE ANY(ARRAY[
  '%tomate%','%batata%','%cebola%','%cenoura%','%pimentão%','%pepino%',
  '%abobrinha%','%berinjela%','%beterraba%','%alho%','%gengibre%',
  '%banana%','%maçã%','%maca%','%laranja%','%limão%','%limao%',
  '%uva%','%manga%','%abacate%','%melão%','%melao%','%abacaxi%',
  '%mamão%','%mamao%','%pera%','%kiwi%','%morango%','%melancia%',
  '%batata doce%','%batata lavada%','%cebola roxa%','%cebola nacional%',
  '%cenoura%','%pimentão verde%','%laranja pera%','%maçã gala%',
  '%manga espada%','%banana nanica%','%banana prata%'
]);

-- Produtos vendidos por unidade ficam como 'unit'
UPDATE public.products SET sell_by = 'unit'
WHERE sell_by IS NULL OR sell_by = 'unit';
