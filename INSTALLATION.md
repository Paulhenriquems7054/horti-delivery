# 🚀 Guia de Instalação - HortiDelivery Lite

## Pré-requisitos

- Node.js 18+ instalado
- Conta no Supabase
- Git

## 1️⃣ Clonar o Repositório

```bash
git clone <seu-repositorio>
cd horti-delivery-lite
```

## 2️⃣ Instalar Dependências

```bash
npm install
```

## 3️⃣ Configurar Supabase

### 3.1 Criar Projeto no Supabase

1. Acesse [supabase.com](https://supabase.com)
2. Crie um novo projeto
3. Anote a URL e a chave anônima (anon key)

### 3.2 Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
VITE_SUPABASE_URL=sua-url-do-supabase
VITE_SUPABASE_ANON_KEY=sua-chave-anonima
```

### 3.3 Executar Migrations

No painel do Supabase, vá em **SQL Editor**.

#### Opção A: Banco Novo (Recomendado)

Execute apenas este arquivo:
- `supabase/migrations/20260328000003_fix_and_update.sql`

Esta migration é **idempotente** e cria tudo do zero.

#### Opção B: Banco Existente

Se você já tem tabelas criadas, execute:
- `supabase/migrations/20260328000003_fix_and_update.sql`

Esta migration verifica o que existe antes de criar/atualizar.

#### ⚠️ Migrations Antigas (Não use se já tem banco)

Se você está começando do zero, pode usar as migrations antigas na ordem:
1. `supabase/migrations/20260322010748_243b3272-a313-4d73-bc54-05df60e4dced.sql`
2. `supabase/migrations/20260322012533_a32cdac7-e9a0-471e-9c17-3d8173152c21.sql`
3. `supabase/migrations/20260328000001_add_new_features.sql`
4. `supabase/migrations/20260328000002_add_rpc_functions.sql`

**Mas é mais fácil usar apenas a `20260328000003_fix_and_update.sql`!**

### 3.4 Popular Dados de Exemplo (Opcional)

Execute o arquivo de seed:

```sql
-- No SQL Editor do Supabase
\i supabase/seed_new_features.sql
```

Ou copie e cole o conteúdo de `supabase/seed_new_features.sql` no SQL Editor.

## 4️⃣ Configurar Autenticação (Admin)

### 4.1 Criar Usuário Admin

No painel do Supabase:

1. Vá em **Authentication** > **Users**
2. Clique em **Add user**
3. Crie um usuário com email e senha
4. Anote as credenciais

### 4.2 Testar Login

```bash
npm run dev
```

Acesse `http://localhost:5173/login` e faça login com as credenciais criadas.

## 5️⃣ Estrutura de Pastas

```
horti-delivery-lite/
├── src/
│   ├── components/        # Componentes React
│   │   ├── admin/        # Componentes administrativos
│   │   └── ui/           # Componentes de UI (shadcn)
│   ├── hooks/            # Custom hooks
│   ├── integrations/     # Integrações (Supabase)
│   ├── pages/            # Páginas da aplicação
│   ├── services/         # Serviços
│   └── lib/              # Utilitários
├── supabase/
│   ├── migrations/       # Migrations do banco
│   └── seed*.sql         # Scripts de seed
└── public/               # Arquivos estáticos
```

## 6️⃣ Rotas da Aplicação

### Públicas
- `/` - Landing page
- `/:slug` - Loja (ex: `/default`)
- `/track` - Rastreamento de pedidos
- `/login` - Login administrativo

### Administrativas (Requer autenticação)
- `/admin` - Dashboard principal
- `/admin/basket` - Gestão de produtos e cestas
- `/admin/stores` - Gestão de lojas
- `/admin/delivery-zones` - Gestão de zonas de entrega
- `/admin/coupons` - Gestão de cupons
- `/admin/analytics` - Relatórios e métricas

## 7️⃣ Funcionalidades Principais

### Para Clientes
- ✅ Navegar produtos por categoria
- ✅ Buscar produtos
- ✅ Adicionar produtos ao carrinho
- ✅ Aplicar cupons de desconto
- ✅ Selecionar zona de entrega
- ✅ Finalizar pedido
- ✅ Rastrear pedidos por telefone

### Para Administradores
- ✅ Gerenciar múltiplas lojas
- ✅ Gerenciar produtos e categorias
- ✅ Gerenciar cestas
- ✅ Gerenciar zonas de entrega
- ✅ Gerenciar cupons de desconto
- ✅ Visualizar pedidos em tempo real (Kanban)
- ✅ Atualizar status de pedidos
- ✅ Ver analytics e relatórios
- ✅ Contatar clientes via WhatsApp

## 8️⃣ Cupons de Exemplo

Após executar o seed, você terá os seguintes cupons:

- `BEMVINDO10` - 10% de desconto (pedido mínimo R$ 30)
- `PRIMEIRACOMPRA` - R$ 5 de desconto (pedido mínimo R$ 20)
- `FRETEGRATIS` - Frete grátis (pedido mínimo R$ 50)
- `DESCONTO15` - 15% de desconto (pedido mínimo R$ 25)

## 9️⃣ Desenvolvimento

### Iniciar servidor de desenvolvimento

```bash
npm run dev
```

### Build para produção

```bash
npm run build
```

### Preview da build

```bash
npm run preview
```

### Lint

```bash
npm run lint
```

### Testes

```bash
npm run test
```

## 🔟 Deploy

### Vercel (Recomendado)

1. Instale a CLI do Vercel:
```bash
npm i -g vercel
```

2. Deploy:
```bash
vercel
```

3. Configure as variáveis de ambiente no painel do Vercel

### Netlify

1. Crie um arquivo `netlify.toml`:
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

2. Deploy via CLI ou conecte o repositório

## 🐛 Troubleshooting

### Erro: "Failed to fetch"
- Verifique se as variáveis de ambiente estão corretas
- Verifique se as migrations foram executadas
- Verifique se o RLS está configurado corretamente

### Erro: "Invalid API key"
- Verifique se a `VITE_SUPABASE_ANON_KEY` está correta
- Certifique-se de usar a chave anônima, não a service key

### Produtos não aparecem
- Execute o seed para popular dados de exemplo
- Verifique se a loja está ativa
- Verifique se os produtos estão ativos

### Cupom não funciona
- Verifique se o cupom está ativo
- Verifique se não expirou
- Verifique se o pedido atinge o valor mínimo
- Verifique se não atingiu o limite de usos

## 📚 Documentação Adicional

- [FEATURES.md](./FEATURES.md) - Lista completa de funcionalidades
- [Supabase Docs](https://supabase.com/docs)
- [React Query Docs](https://tanstack.com/query/latest)
- [Shadcn UI Docs](https://ui.shadcn.com)

## 🆘 Suporte

Para dúvidas ou problemas:
1. Verifique a documentação
2. Revise os logs do console
3. Verifique os logs do Supabase
4. Abra uma issue no repositório

## 🎉 Pronto!

Seu HortiDelivery Lite está configurado e pronto para uso! 🚀
