-- Verificação read-only — aplicar no SQL Editor do Hosted após 20260828100000
-- (e confirmar 20260827180000 / create_customer_order com advisory lock)

-- 1) Pedido duplicado: create_customer_order deve conter pg_advisory_xact_lock
SELECT
  proname AS function_name,
  prosrc LIKE '%pg_advisory_xact_lock%' AS has_duplicate_order_lock,
  prosrc LIKE '%active order exists%' AS has_active_order_check
FROM pg_proc
WHERE proname = 'create_customer_order'
  AND pronamespace = 'public'::regnamespace;

-- 2) Rastreamento: slug obrigatório (função antiga aceitava NULL)
SELECT
  proname,
  pg_get_function_arguments(oid) AS args
FROM pg_proc
WHERE proname = 'get_orders_by_phone'
  AND pronamespace = 'public'::regnamespace;

-- 3) PIN: coluna hash existe, plaintext removida
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'stores'
  AND column_name IN ('delivery_pin', 'delivery_pin_hash');

-- 4) Auto-provisionamento: sem policy INSERT em stores
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'stores' AND cmd = 'INSERT';

-- 5) Bucket de cupons privado
SELECT id, public FROM storage.buckets WHERE id = 'order-receipts';

-- 6) Policies legadas permissivas (deve retornar 0 linhas)
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE 'Anyone can%';
