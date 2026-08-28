-- Verificação pós-migration 20260828120000_security_phase2_3_lgpd.sql

-- 1) Consentimento LGPD no pedido
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'orders'
  AND column_name = 'privacy_acknowledged_at';

-- 2) create_customer_order exige privacy_acknowledged
SELECT prosrc LIKE '%privacy acknowledgment required%' AS privacy_required
FROM pg_proc
WHERE proname = 'create_customer_order';

-- 3) Rate limit em get_order_for_customer
SELECT prosrc LIKE '%check_rate_limit%' AS has_rate_limit
FROM pg_proc
WHERE proname = 'get_order_for_customer';

-- 4) RPC de anonimização (somente authenticated)
SELECT has_function_privilege('authenticated', 'public.anonymize_old_delivered_orders(integer)', 'EXECUTE') AS auth_can_run,
       has_function_privilege('anon', 'public.anonymize_old_delivered_orders(integer)', 'EXECUTE') AS anon_blocked;

-- 5) Assinatura create_customer_order com 11 parâmetros (inclui boolean LGPD)
SELECT pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE proname = 'create_customer_order'
ORDER BY oid DESC
LIMIT 1;
