-- Verificação read-only — aplicar no SQL Editor APÓS
-- 20260828180000_beira_rio_store_features.sql
-- 20260828220000_harden_print_security.sql

-- 1) Job inicial interno; enqueue_order_print público revogado
SELECT
  p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    '_enqueue_initial_order_print',
    'enqueue_order_print',
    'reprint_order',
    '_build_order_receipt_payload'
  )
ORDER BY p.proname;

-- Esperado:
-- _enqueue_initial_order_print: anon=false, auth=false
-- enqueue_order_print: anon=false, auth=false
-- reprint_order: anon=false, auth=true
-- _build_order_receipt_payload: anon=false, auth=false

-- 2) create_customer_order usa job interno e mantém advisory lock
SELECT
  prosrc LIKE '%pg_advisory_xact_lock%' AS has_advisory_lock,
  prosrc LIKE '%_enqueue_initial_order_print%' AS uses_internal_enqueue,
  prosrc NOT LIKE '%enqueue_order_print%' AS no_public_enqueue
FROM pg_proc
WHERE proname = 'create_customer_order'
  AND pronamespace = 'public'::regnamespace;

-- 3) complete_print_job exige status claimed
SELECT prosrc LIKE '%status = ''claimed''%' AS enforces_claimed_state
FROM pg_proc
WHERE proname = 'complete_print_job'
  AND pronamespace = 'public'::regnamespace;

-- 4) claim_print_jobs usa SKIP LOCKED e reclaim
SELECT
  prosrc LIKE '%FOR UPDATE SKIP LOCKED%' AS uses_skip_locked,
  prosrc LIKE '%_reclaim_stale_claimed_print_jobs%' AS reclaims_stale
FROM pg_proc
WHERE proname = 'claim_print_jobs'
  AND pronamespace = 'public'::regnamespace;

-- 5) Rate limit do agente
SELECT prosrc LIKE '%print_agent:%' AS has_print_agent_rate_limit
FROM pg_proc
WHERE proname IN ('_assert_print_agent_rate_limit', '_verify_print_agent_credentials')
  AND pronamespace = 'public'::regnamespace;

-- 6) Policy aberta USING (true) em store_operational_settings (deve ser 0)
SELECT policyname, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'store_operational_settings'
  AND qual = 'true';

-- 7) anon não pode SELECT print_jobs
SELECT has_table_privilege('anon', 'public.print_jobs', 'SELECT') AS anon_select_print_jobs;

-- 8) authenticated não pode INSERT print_jobs
SELECT has_table_privilege('authenticated', 'public.print_jobs', 'INSERT') AS auth_insert_print_jobs;

-- 9) Hash do token: authenticated não pode SELECT a coluna
SELECT has_column_privilege(
  'authenticated',
  'public.store_operational_settings',
  'print_agent_token_hash',
  'SELECT'
) AS auth_can_select_token_hash;

-- 10) get_store_operational_settings não expõe auto_print/store_id no JSON
SELECT
  prosrc NOT LIKE '%auto_print_enabled%' AS no_auto_print_in_rpc,
  prosrc NOT LIKE '%jsonb_build_object(%''store_id''%' AS no_store_id_in_rpc_output
FROM pg_proc
WHERE proname = 'get_store_operational_settings'
  AND pronamespace = 'public'::regnamespace;

-- 11) Idempotency UNIQUE preservada
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'print_jobs'
  AND indexdef LIKE '%UNIQUE%idempotency_key%';

-- 12) Segundo loop create_customer_order revalida store_id
SELECT prosrc LIKE '%AND store_id = v_store.id AND active = true%'
FROM pg_proc
WHERE proname = 'create_customer_order'
  AND pronamespace = 'public'::regnamespace;
