# 🚀 Guia de Deploy para Produção

## ⚠️ Checklist Pré-Deploy

Antes de fazer deploy para produção, certifique-se de:

- [ ] Todas as funcionalidades foram testadas
- [ ] Migrations foram executadas no banco de produção
- [ ] Variáveis de ambiente estão configuradas
- [ ] RLS (Row Level Security) está configurado corretamente
- [ ] Backup do banco de dados foi feito
- [ ] Domínio personalizado está configurado (opcional)
- [ ] SSL/HTTPS está ativo
- [ ] Analytics está configurado (opcional)

## 🔒 Segurança

### 1. Row Level Security (RLS)

As políticas atuais são públicas para MVP. Para produção, ajuste conforme necessário:

```sql
-- Exemplo: Restringir acesso admin
DROP POLICY IF EXISTS "Anyone can update products" ON public.products;
CREATE POLICY "Only authenticated users can update products" 
ON public.products FOR UPDATE 
TO authenticated 
USING (true);

-- Exemplo: Clientes só veem seus pedidos
DROP POLICY IF EXISTS "Anyone can read orders" ON public.orders;
CREATE POLICY "Users can read their own orders" 
ON public.orders FOR SELECT 
USING (phone = current_setting('request.jwt.claims')::json->>'phone');
```

### 2. Variáveis de Ambiente

Nunca commite as chaves reais! Use variáveis de ambiente:

```env
# Produção
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anonima-real
```

### 3. Rate Limiting

Configure rate limiting no Supabase para evitar abuso:
- Vá em Settings > API
- Configure limites de requisições

### 4. CORS

Configure CORS no Supabase:
- Vá em Settings > API
- Adicione seus domínios permitidos

## 🌐 Deploy

### Opção 1: Vercel (Recomendado)

#### Vantagens
- Deploy automático via Git
- SSL gratuito
- CDN global
- Fácil configuração

#### Passos

1. **Instale a CLI**
```bash
npm i -g vercel
```

2. **Faça login**
```bash
vercel login
```

3. **Deploy**
```bash
vercel
```

4. **Configure variáveis de ambiente**
```bash
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
```

5. **Deploy para produção**
```bash
vercel --prod
```

#### Configuração Automática via Git

1. Conecte seu repositório no [vercel.com](https://vercel.com)
2. Configure as variáveis de ambiente no painel
3. Cada push na branch main fará deploy automático

### Opção 2: Netlify

#### Passos

1. **Crie `netlify.toml`**
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[build.environment]
  NODE_VERSION = "18"
```

2. **Deploy via CLI**
```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

3. **Configure variáveis de ambiente**
- Vá em Site settings > Environment variables
- Adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`

### Opção 3: AWS Amplify

#### Passos

1. **Crie `amplify.yml`**
```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

2. **Deploy**
- Conecte repositório no console AWS Amplify
- Configure variáveis de ambiente
- Deploy automático

### Opção 4: Docker

#### Dockerfile

```dockerfile
FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

#### nginx.conf

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}
```

#### Build e Run

```bash
docker build -t horti-delivery .
docker run -p 80:80 horti-delivery
```

## 📊 Monitoramento

### 1. Supabase Dashboard

Monitore:
- Uso de API
- Erros de banco de dados
- Logs de autenticação
- Uso de storage

### 2. Sentry (Opcional)

Para rastreamento de erros:

```bash
npm install @sentry/react
```

```typescript
// src/main.tsx
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "seu-dsn-do-sentry",
  environment: import.meta.env.MODE,
});
```

### 3. Google Analytics (Opcional)

```bash
npm install react-ga4
```

```typescript
// src/main.tsx
import ReactGA from "react-ga4";

ReactGA.initialize("seu-tracking-id");
```

## 🔧 Otimizações

### 1. Build Otimizado

```bash
npm run build
```

Verifique o tamanho dos bundles:
```bash
npm run build -- --mode production
```

### 2. Lazy Loading

Implemente lazy loading para rotas:

```typescript
import { lazy, Suspense } from "react";

const Admin = lazy(() => import("./pages/Admin"));

// No Router
<Suspense fallback={<Loading />}>
  <Route path="/admin" element={<Admin />} />
</Suspense>
```

### 3. Image Optimization

Use formatos modernos (WebP) e lazy loading:

```tsx
<img 
  src="image.webp" 
  loading="lazy" 
  alt="Produto"
/>
```

### 4. Caching

Configure headers de cache no Vercel:

```json
// vercel.json
{
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

## 📱 PWA (Opcional)

Transforme em Progressive Web App:

```bash
npm install vite-plugin-pwa -D
```

```typescript
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'HortiDelivery Lite',
        short_name: 'HortiDelivery',
        description: 'Hortifruti fresquinho na sua porta',
        theme_color: '#10b981',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
});
```

## 🔄 CI/CD

### GitHub Actions

Crie `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run build
      - run: npm test
      - uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          vercel-args: '--prod'
```

## 📧 Email (Opcional)

Configure emails transacionais:

### Opção 1: SendGrid

```bash
npm install @sendgrid/mail
```

### Opção 2: Resend

```bash
npm install resend
```

### Opção 3: Supabase Edge Functions

Crie uma Edge Function para enviar emails.

## 💳 Pagamentos (Futuro)

Para adicionar pagamentos online:

### Opção 1: Stripe

```bash
npm install @stripe/stripe-js
```

### Opção 2: Mercado Pago

```bash
npm install mercadopago
```

### Opção 3: PagSeguro

Integração via API REST.

## 📱 WhatsApp Business API (Opcional)

Para notificações automáticas via WhatsApp:

1. Configure WhatsApp Business API
2. Use Twilio ou similar
3. Envie notificações de status

## 🔍 SEO

### 1. Meta Tags

Adicione em `index.html`:

```html
<meta name="description" content="Hortifruti fresquinho na sua porta">
<meta name="keywords" content="hortifruti, delivery, frutas, verduras">
<meta property="og:title" content="HortiDelivery Lite">
<meta property="og:description" content="Hortifruti fresquinho na sua porta">
<meta property="og:image" content="/og-image.jpg">
```

### 2. Sitemap

Gere um sitemap.xml:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://seusite.com/</loc>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://seusite.com/track</loc>
    <priority>0.8</priority>
  </url>
</urlset>
```

### 3. robots.txt

```txt
User-agent: *
Allow: /
Disallow: /admin/

Sitemap: https://seusite.com/sitemap.xml
```

## 🎯 Performance

### Métricas Alvo

- First Contentful Paint (FCP): < 1.8s
- Largest Contentful Paint (LCP): < 2.5s
- Time to Interactive (TTI): < 3.8s
- Cumulative Layout Shift (CLS): < 0.1

### Ferramentas

- [Lighthouse](https://developers.google.com/web/tools/lighthouse)
- [PageSpeed Insights](https://pagespeed.web.dev/)
- [WebPageTest](https://www.webpagetest.org/)

## 🔐 Backup

### Banco de Dados

Configure backups automáticos no Supabase:
- Vá em Settings > Database
- Configure Point-in-Time Recovery (PITR)

### Código

- Use Git
- Faça backups regulares
- Mantenha múltiplos remotes

## 📞 Suporte

### Documentação

Mantenha atualizado:
- README.md
- FEATURES.md
- INSTALLATION.md
- Este arquivo (PRODUCTION.md)

### Logs

Configure logging adequado:
- Erros de aplicação
- Erros de API
- Eventos importantes

## ✅ Checklist Final

Antes de considerar o deploy completo:

- [ ] Testes passaram
- [ ] Build funciona
- [ ] Variáveis de ambiente configuradas
- [ ] RLS ajustado para produção
- [ ] SSL ativo
- [ ] Domínio configurado
- [ ] Backup configurado
- [ ] Monitoramento ativo
- [ ] Documentação atualizada
- [ ] Equipe treinada

## 🎉 Pronto!

Seu HortiDelivery Lite está pronto para produção! 🚀

Lembre-se de:
- Monitorar regularmente
- Fazer backups
- Atualizar dependências
- Coletar feedback dos usuários
- Iterar e melhorar continuamente
