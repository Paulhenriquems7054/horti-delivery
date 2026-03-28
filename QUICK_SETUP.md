# 🚀 Setup Rápido - HortiDelivery Lite

## ⚠️ Você já tem o banco criado?

Se você já executou migrations anteriores e está com erros, siga este guia.

## 📝 Passo a Passo

### 1. Acesse o Supabase

1. Vá para [supabase.com](https://supabase.com)
2. Abra seu projeto
3. Vá em **SQL Editor**

### 2. Execute APENAS esta Migration

Copie e cole o conteúdo do arquivo:
```
supabase/migrations/20260328000004_final_fix.sql
```

⚠️ **IMPORTANTE**: Esta migration vai recriar algumas tabelas (stores, delivery_zones, categories, coupons). Se você já tem dados nessas tabelas, eles serão perdidos. Faça backup antes!

### 3. Execute o Seed (Opcional)

Se quiser dados de exemplo, execute:
```
supabase/seed_new_features.sql
```

### 4. Pronto! ✅

Seu banco está atualizado com todas as novas funcionalidades!

## 🔍 O que esta Migration faz?

- ✅ Cria novas tabelas (stores, delivery_zones, categories, coupons, favorites, order_tracking)
- ✅ Adiciona novos campos nas tabelas existentes
- ✅ Cria índices para performance
- ✅ Configura RLS (Row Level Security)
- ✅ Cria função RPC para cupons
- ✅ Insere loja padrão
- ✅ Atualiza dados existentes
- ✅ **Não quebra se já existir!**

## ❌ Erros Comuns

### "relation already exists"
✅ **Ignorar** - A migration verifica antes de criar

### "policy already exists"
✅ **Ignorar** - A migration remove antes de criar

### "column already exists"
✅ **Ignorar** - A migration verifica antes de adicionar

## 🧪 Testar se Funcionou

Execute no SQL Editor:

```sql
-- Verificar se as tabelas foram criadas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('stores', 'delivery_zones', 'categories', 'coupons', 'favorites', 'order_tracking');

-- Verificar se a loja padrão foi criada
SELECT * FROM public.stores WHERE slug = 'default';

-- Verificar novos campos em products
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'products' 
AND column_name IN ('store_id', 'category_id', 'description', 'unit', 'stock', 'featured');
```

Se retornar resultados, está tudo certo! ✅

## 🎯 Próximos Passos

1. Execute o seed para dados de exemplo (opcional)
2. Configure as variáveis de ambiente no `.env`
3. Execute `npm run dev`
4. Acesse `http://localhost:5173`
5. Faça login em `/login`
6. Explore as novas funcionalidades!

## 📚 Documentação Completa

- [INSTALLATION.md](./INSTALLATION.md) - Guia completo de instalação
- [FEATURES.md](./FEATURES.md) - Lista de funcionalidades
- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - Como testar

## 🆘 Ainda com Problemas?

1. Verifique se está usando a versão correta do PostgreSQL (14+)
2. Verifique se tem permissões de admin no Supabase
3. Tente executar a migration em partes (copie seções específicas)
4. Verifique os logs de erro no Supabase

## 💡 Dica

Se quiser começar do zero:

1. Delete todas as tabelas no Supabase
2. Execute apenas a migration `20260328000003_fix_and_update.sql`
3. Execute o seed
4. Pronto!

---

**Tempo estimado**: 5 minutos ⏱️
