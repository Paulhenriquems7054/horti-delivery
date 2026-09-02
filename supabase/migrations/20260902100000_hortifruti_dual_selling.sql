-- Hortifrúti: venda dual (kg ou unidade) para produtos importados como unit

UPDATE public.products p
SET
  sell_by = 'both',
  average_weight = COALESCE(p.average_weight, 0.3),
  weight_variance = COALESCE(p.weight_variance, 0.15),
  price_per_unit = COALESCE(p.price_per_unit, p.price),
  price_per_kg = COALESCE(
    p.price_per_kg,
    CASE
      WHEN COALESCE(p.average_weight, 0.3) > 0
        THEN COALESCE(p.price_per_unit, p.price) / COALESCE(p.average_weight, 0.3)
      ELSE p.price
    END
  )
FROM public.categories c
WHERE p.category_id = c.id
  AND lower(trim(c.name)) = lower('Hortifrúti')
  AND p.sell_by IS DISTINCT FROM 'both'
  AND p.sell_by IS DISTINCT FROM 'weight';

CREATE OR REPLACE FUNCTION public.enforce_hortifruti_dual_selling()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_cat_name TEXT;
BEGIN
  IF NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.name INTO v_cat_name
  FROM public.categories c
  WHERE c.id = NEW.category_id;

  IF lower(trim(v_cat_name)) <> lower('Hortifrúti') THEN
    RETURN NEW;
  END IF;

  NEW.sell_by := 'both';
  NEW.average_weight := COALESCE(NEW.average_weight, 0.3);
  NEW.weight_variance := COALESCE(NEW.weight_variance, 0.15);
  NEW.price_per_unit := COALESCE(NEW.price_per_unit, NEW.price);
  NEW.price_per_kg := COALESCE(
    NEW.price_per_kg,
    CASE
      WHEN COALESCE(NEW.average_weight, 0.3) > 0
        THEN COALESCE(NEW.price_per_unit, NEW.price) / COALESCE(NEW.average_weight, 0.3)
      ELSE NEW.price
    END
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_hortifruti_dual_selling ON public.products;

CREATE TRIGGER trg_enforce_hortifruti_dual_selling
  BEFORE INSERT OR UPDATE OF category_id, sell_by, price, price_per_unit, price_per_kg
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_hortifruti_dual_selling();
