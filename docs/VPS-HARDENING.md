# Checklist de hardening VPS (HortiDelivery)

Use este guia ao hospedar o frontend estático ou um reverse proxy na VPS. O Supabase Hosted permanece como backend gerenciado.

## 1. Sistema operacional

- [ ] Atualizar pacotes: `apt update && apt upgrade -y` (Debian/Ubuntu)
- [ ] Criar usuário não-root com sudo para deploy
- [ ] Desabilitar login SSH como root (`PermitRootLogin no`)
- [ ] Autenticação SSH apenas por chave (`PasswordAuthentication no`)
- [ ] Fail2ban para SSH e, se exposto, para o servidor web

## 2. Firewall

- [ ] UFW ou nftables: permitir apenas 22 (SSH), 80 e 443
- [ ] Bloquear portas internas (5432, Redis, etc.) para a internet

## 3. TLS e proxy

- [ ] Certificado Let's Encrypt (Certbot ou Caddy automático)
- [ ] Redirecionar HTTP → HTTPS
- [ ] HSTS (`Strict-Transport-Security`) após validar HTTPS
- [ ] Nginx/Caddy como reverse proxy para arquivos estáticos do Vite build

### Exemplo de headers de segurança (Nginx)

```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(self), microphone=(), geolocation=()" always;
```

## 4. Aplicação

- [ ] Servir apenas `dist/` após `npm run build`
- [ ] Nunca expor `.env` ou arquivos de configuração
- [ ] Variáveis sensíveis só no painel (Vercel/Supabase), não na VPS
- [ ] `VITE_HCAPTCHA_SITE_KEY` e chaves Supabase anon no build — nunca service role no frontend

## 5. Edge Functions (Supabase)

- [ ] Definir `ALLOWED_ORIGINS=https://seudominio.com,https://www.seudominio.com` nas secrets das functions
- [ ] `CRON_SECRET` forte para `expire-paid-subscriptions`
- [ ] Rotacionar secrets periodicamente

## 6. Monitoramento e backup

- [ ] Logs centralizados (journald + rotação)
- [ ] Alertas de disco e CPU
- [ ] Backup do banco via Supabase (PITR/plano pago) — VPS não substitui backup do Postgres

## 7. LGPD operacional

- [ ] Agendar job mensal: `SELECT public.anonymize_old_delivered_orders(365);` (platform admin ou cron SQL)
- [ ] Documentar canal de contato do titular (e-mail da loja/plataforma)
- [ ] Revisar retenção de comprovantes no bucket `order-receipts`

## 8. Pós-deploy

- [ ] `npm audit` sem vulnerabilidades críticas
- [ ] Testar login admin, checkout, rastreamento e entrega
- [ ] Confirmar `/superadmin` bloqueado para não-admins
