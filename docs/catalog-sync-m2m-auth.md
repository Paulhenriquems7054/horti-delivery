# Autenticação M2M — integração PDV (preparação)

## Princípio

O fornecedor PDV **nunca** envia `store_id` como autoridade no payload.

```
API KEY / JWT / assinatura
        ↓
Edge Function ou RPC SECURITY DEFINER
        ↓
integration_id autenticado
        ↓
store_integrations.store_id + provider
        ↓
operações exclusivas naquela loja
```

## O que a credencial identifica

| Campo resolvido | Origem |
|-----------------|--------|
| `integration_id` | Token/API key (hash lookup server-side) |
| `store_id` | `store_integrations.store_id` |
| `provider` | `store_integrations.provider` |

## Onde NÃO colocar segredos

- React / Vite (`VITE_*`)
- `localStorage` / `sessionStorage`
- Payload JSON do cliente
- `store_integrations.config` exposto ao frontend
- `catalog_sync_items.reason` / `metadata` com tokens
- Logs de erro públicos

## Opções compatíveis com Supabase atual

1. **Edge Function** + header `Authorization: Bearer <integration_secret>` — hash comparado server-side (Vault/env)
2. **RPC SECURITY DEFINER** invocada somente por `service_role` a partir da Edge Function
3. **JWT custom** assinado pelo HortiDelivery com claim `integration_id` (curta duração)

## Fluxo server-side (futuro)

Ver `docs/catalog-sync-server-flow.md`

Nesta etapa: **nenhuma credencial real** é gerada ou armazenada.
