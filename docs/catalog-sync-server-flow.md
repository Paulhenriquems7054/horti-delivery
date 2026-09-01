# Fluxo server-side de sincronização (projeto — não exposto)

```
Fornecedor PDV (futuro)
      ↓
Adapter específico (por fornecedor)
      ↓
NormalizedCatalogProduct[]
      ↓
Autenticação M2M (integration_id)
      ↓
Resolver store_id server-side (store_integrations)
      ↓
Carregar snapshot: products + product_external_identifiers (mesma loja)
      ↓
resolveCatalogSyncAction() — por item
      ↓
┌─────────────────────────────────────────┐
│ CREATE  → INSERT products               │
│           + INSERT external_identifier  │
│ UPDATE  → UPDATE campos PDV only        │
│           (preservar category_id)       │
│ SKIP    → log em catalog_sync_items     │
│ CONFLICT→ log, não alterar produto      │
│ ERROR   → log, não alterar produto      │
└─────────────────────────────────────────┘
      ↓
catalog_sync_runs (resumo)
catalog_sync_items (detalhe)
```

## Proibido nesta etapa

- Endpoint público com `store_id` no body
- Escrita direta via PostgREST `authenticated`
- Sync real de produtos/preços

## Escrita no Hosted (futuro)

Somente via RPC `run_catalog_sync_batch` (a criar) ou Edge Function com `service_role`, validando:

1. `integration_id` autenticado
2. `store_id` derivado da integração
3. Ownership de campos (`applyPdvPatchPreservingHorti`)
4. Idempotência em `product_external_identifiers`
