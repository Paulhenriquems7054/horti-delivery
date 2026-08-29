# Agente local de impressão — Beira Rio / HortiDelivery

Este agente roda no **computador da loja** (Windows/Linux) e consome a fila `print_jobs` no Supabase.

## Arquitetura

```text
Pedido confirmado (RPC create_customer_order)
        ↓
Fila print_jobs (status: pending)
        ↓
Agente local (este script) — claim_print_jobs → retorna `{ job_id, order_id, payload }`
        ↓
Spooler do sistema (print / lp)
        ↓
Impressora matricial ou térmica
```

## Pré-requisitos

1. Migrations `20260828180000_beira_rio_store_features.sql` e `20260828220000_harden_print_security.sql` aplicadas no Supabase
2. Loja com `auto_print_enabled = true` (Beira Rio já vem configurada)
3. Token do agente definido no admin da loja (RPC `update_store_print_agent_token`)

## Configurar token (SQL Editor, como lojista logado ou platform admin)

```sql
SELECT public.update_store_print_agent_token('seu-token-secreto-forte');
```

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `SUPABASE_URL` | Sim | URL do projeto |
| `SUPABASE_ANON_KEY` | Sim | Chave anon |
| `PRINT_AGENT_TOKEN` | Sim | Mesmo token configurado na loja |
| `STORE_SLUG` | Não | Default: `beira-rio` |
| `PRINT_POLL_MS` | Não | Intervalo de polling (default 5000) |
| `PRINT_PRINTER_NAME` | Não | Nome da impressora no Windows/CUPS |

## Executar

```bash
cd tools/print-agent
npm install @supabase/supabase-js
node index.mjs
```

## Windows — impressora matricial

- Instale o driver da impressora (Epson LX, Bematech, etc.)
- Opcional: `PRINT_PRINTER_NAME=NomeDaImpressora`
- O script usa o comando `print` do Windows

## Reimpressão manual

No painel admin, abra **Detalhes do pedido** → **Reimprimir pedido** (RPC `reprint_order`).

## Falhas

- Se a impressora estiver offline, o job fica `failed` com mensagem de erro
- A **criação do pedido não é afetada**
- Reimpressão gera novo job na fila
