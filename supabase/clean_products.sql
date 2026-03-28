-- 1. Remove produtos com nomes corrompidos (binários/inválidos) e preço 0
DELETE FROM public.basket_items
WHERE product_id IN (
  SELECT id FROM public.products
  WHERE price = 0
    OR name ~ '[^\x00-\x7F\u00C0-\u024F\u1E00-\u1EFF]'  -- caracteres não-latinos
    OR length(name) > 100
    OR name LIKE '%PK%'
    OR name LIKE '%xml%'
    OR name LIKE '%rels%'
    OR name LIKE '%docProps%'
);

DELETE FROM public.products
WHERE price = 0
  OR name ~ '[^\x00-\x7F\u00C0-\u024F\u1E00-\u1EFF]'
  OR length(name) > 100
  OR name LIKE '%PK%'
  OR name LIKE '%xml%'
  OR name LIKE '%rels%'
  OR name LIKE '%docProps%';

-- 2. Remove duplicatas — mantém apenas o de menor preço mais recente por nome base
-- (ex: "Alface Crespa" e "Alface Crespa (un)" -> mantém só "Alface Crespa")
DELETE FROM public.basket_items
WHERE product_id IN (
  SELECT id FROM public.products
  WHERE name LIKE '%(kg)%' OR name LIKE '%(un)%' OR name LIKE '%(Dúzia)%' OR name LIKE '%(maço)%'
);

DELETE FROM public.products
WHERE name LIKE '%(kg)%' OR name LIKE '%(un)%' OR name LIKE '%(Dúzia)%' OR name LIKE '%(maço)%';

-- 3. Remove duplicatas exatas por nome (mantém o mais antigo)
DELETE FROM public.basket_items
WHERE product_id IN (
  SELECT id FROM public.products p
  WHERE EXISTS (
    SELECT 1 FROM public.products p2
    WHERE LOWER(p2.name) = LOWER(p.name)
      AND p2.id < p.id
  )
);

DELETE FROM public.products p
WHERE EXISTS (
  SELECT 1 FROM public.products p2
  WHERE LOWER(p2.name) = LOWER(p.name)
    AND p2.id < p.id
);

-- 4. Resultado final limpo
SELECT name, price, active FROM public.products ORDER BY name;
