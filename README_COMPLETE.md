# 🌿 HortiDelivery Lite - Sistema Completo de E-commerce

> Plataforma completa de delivery para hortifruti com suporte multi-tenant, sistema de cupons, zonas de entrega, analytics e muito mais!

[![React](https://img.shields.io/badge/React-18-blue)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Latest-green)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-blue)](https://tailwindcss.com/)

## 📋 Índice

- [Sobre](#sobre)
- [Funcionalidades](#funcionalidades)
- [Tecnologias](#tecnologias)
- [Instalação](#instalação)
- [Uso](#uso)
- [Documentação](#documentação)
- [Deploy](#deploy)
- [Contribuindo](#contribuindo)
- [Licença](#licença)

## 🎯 Sobre

HortiDelivery Lite é uma plataforma completa de e-commerce especializada em delivery de hortifruti. O sistema oferece:

- 🏪 **Multi-tenant**: Suporte para múltiplas lojas
- 🎟️ **Sistema de Cupons**: Descontos e promoções
- 📍 **Zonas de Entrega**: Taxas personalizadas por região
- 📊 **Analytics**: Relatórios e métricas detalhadas
- 🔍 **Busca e Filtros**: Encontre produtos facilmente
- 📦 **Rastreamento**: Acompanhe seus pedidos
- ⚡ **Tempo Real**: Atualizações instantâneas
- 📱 **Responsivo**: Funciona em todos os dispositivos

## ✨ Funcionalidades

### Para Clientes

- ✅ Navegar produtos por categoria
- ✅ Buscar produtos em tempo real
- ✅ Adicionar produtos ao carrinho
- ✅ Aplicar cupons de desconto
- ✅ Selecionar zona de entrega
- ✅ Calcular frete automaticamente
- ✅ Finalizar pedido sem cadastro
- ✅ Rastrear pedidos por telefone
- ✅ Ver histórico de pedidos
- ✅ Pagamento na entrega

### Para Administradores

- ✅ Dashboard com métricas em tempo real
- ✅ Kanban de pedidos (arrastar e soltar)
- ✅ Gerenciar múltiplas lojas
- ✅ Gerenciar produtos e categorias
- ✅ Gerenciar cestas personalizadas
- ✅ Gerenciar zonas de entrega
- ✅ Gerenciar cupons de desconto
- ✅ Ver analytics e relatórios
- ✅ Atualizar status de pedidos
- ✅ Contatar clientes via WhatsApp
- ✅ Exportar relatórios

## 🛠️ Tecnologias

### Frontend
- **React 18** - Biblioteca UI
- **TypeScript** - Tipagem estática
- **Vite** - Build tool
- **React Router** - Roteamento
- **React Query** - Gerenciamento de estado
- **Tailwind CSS** - Estilização
- **Shadcn UI** - Componentes
- **Lucide Icons** - Ícones

### Backend
- **Supabase** - Backend as a Service
  - PostgreSQL - Banco de dados
  - Realtime - Atualizações em tempo real
  - Auth - Autenticação
  - Storage - Armazenamento de arquivos
  - Edge Functions - Serverless functions

### DevOps
- **Git** - Controle de versão
- **GitHub Actions** - CI/CD
- **Vercel** - Hospedagem
- **ESLint** - Linting
- **Prettier** - Formatação

## 📦 Instalação

### Pré-requisitos

- Node.js 18+
- npm ou yarn
- Conta no Supabase

### Passo a Passo

1. **Clone o repositório**
```bash
git clone <seu-repositorio>
cd horti-delivery-lite
```

2. **Instale as dependências**
```bash
npm install
```

3. **Configure as variáveis de ambiente**
```bash
cp .env.example .env
```

Edite o `.env` com suas credenciais do Supabase:
```env
VITE_SUPABASE_URL=sua-url
VITE_SUPABASE_ANON_KEY=sua-chave
```

4. **Execute as migrations**

No SQL Editor do Supabase, execute na ordem:
- `supabase/migrations/20260322010748_*.sql`
- `supabase/migrations/20260322012533_*.sql`
- `supabase/migrations/20260328000001_*.sql`
- `supabase/migrations/20260328000002_*.sql`

5. **Popule dados de exemplo (opcional)**
```sql
-- No SQL Editor do Supabase
\i supabase/seed_new_features.sql
```

6. **Inicie o servidor de desenvolvimento**
```bash
npm run dev
```

7. **Acesse a aplicação**
```
http://localhost:5173
```

## 🚀 Uso

### Acessar como Cliente

1. Acesse `/` para ver a landing page
2. Clique em "Explorar Lojas Locais"
3. Navegue pelos produtos
4. Adicione ao carrinho
5. Finalize o pedido

### Acessar como Admin

1. Acesse `/login`
2. Faça login com suas credenciais
3. Acesse o dashboard em `/admin`

### Rotas Disponíveis

#### Públicas
- `/` - Landing page
- `/:slug` - Loja (ex: `/default`)
- `/track` - Rastreamento de pedidos
- `/login` - Login administrativo

#### Administrativas (Requer autenticação)
- `/admin` - Dashboard principal
- `/admin/basket` - Gestão de produtos
- `/admin/stores` - Gestão de lojas
- `/admin/delivery-zones` - Gestão de zonas
- `/admin/coupons` - Gestão de cupons
- `/admin/analytics` - Relatórios

## 📚 Documentação

### Documentos Disponíveis

- **[FEATURES.md](./FEATURES.md)** - Lista completa de funcionalidades
- **[INSTALLATION.md](./INSTALLATION.md)** - Guia detalhado de instalação
- **[TESTING_GUIDE.md](./TESTING_GUIDE.md)** - Guia de testes
- **[PRODUCTION.md](./PRODUCTION.md)** - Guia de deploy
- **[SUMMARY.md](./SUMMARY.md)** - Resumo executivo

### Estrutura do Projeto

```
horti-delivery-lite/
├── src/
│   ├── components/          # Componentes React
│   │   ├── admin/          # Componentes admin
│   │   └── ui/             # Componentes UI
│   ├── hooks/              # Custom hooks
│   ├── integrations/       # Integrações
│   ├── pages/              # Páginas
│   ├── services/           # Serviços
│   └── lib/                # Utilitários
├── supabase/
│   ├── migrations/         # Migrations
│   └── seed*.sql          # Seeds
├── public/                 # Arquivos estáticos
└── docs/                   # Documentação
```

## 🎨 Screenshots

### Landing Page
![Landing Page](./screenshots/landing.png)

### Loja
![Loja](./screenshots/store.png)

### Dashboard Admin
![Dashboard](./screenshots/admin.png)

### Analytics
![Analytics](./screenshots/analytics.png)

## 🧪 Testes

### Executar testes

```bash
npm run test
```

### Executar testes em watch mode

```bash
npm run test:watch
```

### Cobertura de testes

```bash
npm run test:coverage
```

## 🚀 Deploy

### Vercel (Recomendado)

```bash
npm i -g vercel
vercel login
vercel
```

### Netlify

```bash
npm i -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

### Docker

```bash
docker build -t horti-delivery .
docker run -p 80:80 horti-delivery
```

Veja [PRODUCTION.md](./PRODUCTION.md) para mais detalhes.

## 📊 Status do Projeto

- ✅ MVP Completo
- ✅ Todas as funcionalidades implementadas
- ✅ Testes realizados
- ✅ Documentação completa
- ✅ Pronto para produção

## 🗺️ Roadmap

### Próximas Funcionalidades

- [ ] Upload de imagens de produtos
- [ ] Notificações push
- [ ] Impressão de pedidos
- [ ] Sistema de favoritos (UI)
- [ ] Cancelamento de pedidos (UI)
- [ ] Autenticação de clientes
- [ ] Sistema de avaliações
- [ ] Programa de fidelidade
- [ ] Integração com pagamentos online
- [ ] App mobile (React Native)

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📝 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](./LICENSE) para mais detalhes.

## 👥 Autores

- **Seu Nome** - *Desenvolvimento Inicial* - [seu-github](https://github.com/seu-usuario)

## 🙏 Agradecimentos

- [Supabase](https://supabase.com) - Backend as a Service
- [Shadcn UI](https://ui.shadcn.com) - Componentes UI
- [Lucide](https://lucide.dev) - Ícones
- [Vercel](https://vercel.com) - Hospedagem

## 📞 Suporte

Para suporte, envie um email para suporte@horti.com ou abra uma issue no GitHub.

## 🔗 Links Úteis

- [Documentação do Supabase](https://supabase.com/docs)
- [Documentação do React](https://react.dev)
- [Documentação do Tailwind CSS](https://tailwindcss.com/docs)
- [Documentação do React Query](https://tanstack.com/query/latest)

---

Feito com 💚 por [Seu Nome](https://github.com/seu-usuario)
