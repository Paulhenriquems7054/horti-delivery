-- Script de Verificação - Execute no SQL Editor do Supabase
-- Este script verifica se tudo foi configurado corretamente

-- 1. Verificar tabelas criadas
SELECT 
  'Tabelas Criadas' as check_type,
  COUNT(*) as total,
  STRING_AGG(table_name, ', ') as tables
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('stores', 'delivery_zones', 'categories', 'coupons', 'favorites', 'order_tracking', 'products', 'baskets', 'orders', 'order_items');

-- 2. Verificar loja padrão
SELECT 
  'Loja Padrão' as check_type,
  id,
  name,
  slug,
  active
FROM public.stores 
WHERE slug = 'default';

-- 3. Verificar novos campos em products
SELECT 
  'Campos em Products' as check_type,
  COUNT(*) as total_columns
FROM information_schema.columns 
WHERE table_name = 'products' 
AND column_name IN ('store_id', 'category_id', 'description', 'unit', 'stock', 'featured');

-- 4. Verificar novos campos em orders
SELECT 
  'Campos em Orders' as check_type,
  COUNT(*) as total_columns
FROM information_schema.columns 
WHERE table_name = 'orders' 
AND column_name IN ('store_id', 'delivery_zone_id', 'coupon_id', 'delivery_fee', 'discount', 'notes', 'email', 'cancelled_at', 'cancelled_reason');

-- 5. Verificar políticas RLS
SELECT 
  'Políticas RLS' as check_type,
  schemaname,
  tablename,
  COUNT(*) as total_policies
FROM pg_policies 
WHERE schemaname = 'public'
AND tablename IN ('stores', 'delivery_zones', 'categories', 'coupons', 'favorites', 'order_tracking')
GROUP BY schemaname, tablename;

-- 6. Verificar função RPC
SELECT 
  'Função RPC' as check_type,
  proname as function_name,
  pronargs as num_args
FROM pg_proc 
WHERE proname = 'increment_coupon_usage';

-- 7. Verificar realtime
SELECT 
  'Realtime' as check_type,
  pubname as publication_name,
  (SELECT COUNT(*) FROM pg_publication_tables WHERE pubname = 'supabase_realtime') as total_tables
FROM pg_publication 
WHERE pubname = 'supabase_realtime';

-- 8. Verificar índices
SELECT 
  'Índices' as check_type,
  COUNT(*) as total_indexes
FROM pg_indexes 
WHERE schemaname = 'public'
AND indexname LIKE 'idx_%';

-- 9. Contar registros (após seed)
SELECT 'Produtos' as table_name, COUNT(*) as total FROM public.products
UNION ALL
SELECT 'Lojas', COUNT(*) FROM public.stores
UNION ALL
SELECT 'Zonas de Entrega', COUNT(*) FROM public.delivery_zones
UNION ALL
SELECT 'Categorias', COUNT(*) FROM public.categories
UNION ALL
SELECT 'Cupons', COUNT(*) FROM public.coupons
UNION ALL
SELECT 'Cestas', COUNT(*) FROM public.baskets
UNION ALL
SELECT 'Pedidos', COUNT(*) FROM public.orders;

-- 10. Verificar cupons ativos
SELECT 
  'Cupons Disponíveis' as info,
  code,
  discount_type,
  discount_value,
  min_order,
  active,
  expires_at
FROM public.coupons
WHERE active = true
ORDER BY created_at DESC;

-- ✅ Se todos os checks retornaram resultados, está tudo OK!
