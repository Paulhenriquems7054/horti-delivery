# Arquitetura de integração PDV — HortiDelivery

Documento de preparação local. **Não aplicado no Hosted.**

## Princípio

```
PDV fornecedor → Adapter → ExternalCatalogProduct → Sync Engine → RPC (futuro) → products
```

## Tabelas existentes reutilizadas

| Tabela/coluna | Uso |
|---------------|-----|
| `products.internal_code` | Identidade secundária (unique por loja se ativo) |
| `products.barcode` | Fallback EAN significativo |
| `products.category_id` | Ownership Horti — preservado se PDV não envia categoria |
| `product_imports` | Histórico de importação manual (planilha) |
| `product_import_batches` | Lotes idempotentes da importação |

## Tabelas propostas (migration local)

Arquivo: `supabase/migrations/20260901120000_catalog_pdv_integration_proposed.sql`

- `store_integrations` — config por loja/provider (sem secrets no JSON exposto)
- `product_external_identifiers` — `UNIQUE(store_id, provider, external_id)`
- `catalog_sync_runs` — resumo por execução
- `catalog_sync_items` — detalhe conflitos/erros

## Contrato normalizado

Ver `src/lib/catalogIntegration/types.ts` — `ExternalCatalogProduct`.

## Motor de sincronização (client-side / testável)

Ver `src/lib/catalogIntegration/syncEngine.ts` — ações: CREATE, UPDATE, SKIP, CONFLICT, DEACTIVATE.

## Ownership de campos

Ver `src/lib/catalogIntegration/ownership.ts`.

## Segurança futura

1. Credencial M2M → resolve `integration_id` → `store_id` server-side
2. Nunca aceitar `store_id` do payload do PDV
3. RLS: owner SELECT nas tabelas de integração/sync
4. RPCs de escrita: SECURITY DEFINER + `get_my_store_id()` ou service role isolado
5. Secrets em Vault / env server-side, não em `config` JSON do cliente

## UI Admin

- Operação principal: métricas Hosted + catálogo paginado + produtos sem categoria
- Legado planilha: `/admin/basket/legacy-review`
- PDV: painel informativo (sem conexão ativa)
