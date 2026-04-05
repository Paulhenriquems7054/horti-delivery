# Visualização de Todos os Produtos - Admin

## Problema Resolvido
O admin não conseguia visualizar todos os produtos existentes na loja, apenas os que estavam adicionados à cesta ativa. Isso dificultava o gerenciamento do catálogo completo.

## Solução Implementada

### Nova Seção: "Todos os Produtos da Loja"

Adicionada uma nova seção na página `/admin/basket` que permite ao admin:

1. **Ver TODOS os produtos cadastrados** na loja (não apenas os da cesta)
2. **Identificar facilmente** quais produtos estão ou não na cesta
3. **Adicionar produtos à cesta** com um clique

### Funcionalidades

#### 1. Botão "Mostrar Todos"
- Localizado no cabeçalho da nova seção
- Expande/colapsa a visualização de todos os produtos
- Carrega os produtos apenas quando expandido (otimização de performance)

#### 2. Produtos Organizados em Duas Categorias

**✓ Na Cesta (verde)**
- Mostra todos os produtos que já estão na cesta ativa
- Fundo verde claro para fácil identificação
- Exibe nome, preço e ícone de confirmação (✓)
- Grid responsivo (1 coluna mobile, 2 colunas desktop)

**⚠ Fora da Cesta (amarelo)**
- Mostra produtos cadastrados mas NÃO incluídos na cesta
- Fundo padrão com borda
- Botão "+" para adicionar à cesta rapidamente
- Mesmo layout responsivo

#### 3. Adicionar à Cesta
- Botão "+" em cada produto fora da cesta
- Adiciona o produto com quantidade padrão de 1
- Feedback visual com toast de sucesso
- Atualiza automaticamente ambas as listas

### Queries Implementadas

```typescript
// Query para buscar TODOS os produtos da loja
const { data: allProducts } = useQuery({
  queryKey: ["all-products", basket?.id],
  queryFn: async () => {
    // 1. Busca store_id da cesta
    // 2. Busca TODOS os produtos desse store_id
    // 3. Ordena por nome
  },
  enabled: !!basket && showAllProducts, // Só carrega quando expandido
});

// Filtra produtos que NÃO estão na cesta
const productsNotInBasket = allProducts?.filter(
  (product) => !basket?.items.some((item) => item.products.id === product.id)
);
```

### Mutation para Adicionar

```typescript
const addToBasketMutation = useMutation({
  mutationFn: async (productId: string) => {
    await supabase
      .from("basket_items")
      .insert([{ 
        basket_id: basket.id, 
        product_id: productId, 
        quantity: 1 
      }]);
  },
  onSuccess: () => {
    // Invalida queries para atualizar as listas
    queryClient.invalidateQueries({ queryKey: ["admin-active-basket"] });
    queryClient.invalidateQueries({ queryKey: ["all-products"] });
  }
});
```

## Fluxo de Uso

1. Admin acessa `/admin/basket`
2. Rola até a seção "Todos os Produtos da Loja"
3. Clica em "Mostrar Todos"
4. Visualiza:
   - Produtos já na cesta (verde)
   - Produtos fora da cesta (com botão +)
5. Clica no botão "+" para adicionar produto à cesta
6. Produto move automaticamente para a seção verde

## Benefícios

1. **Visibilidade Total**: Admin vê todos os produtos cadastrados
2. **Gestão Facilitada**: Fácil identificar o que está ou não na cesta
3. **Adição Rápida**: Um clique para adicionar produtos
4. **Performance**: Carrega apenas quando necessário (enabled: showAllProducts)
5. **Feedback Visual**: Cores diferentes para cada categoria
6. **Responsivo**: Funciona bem em mobile e desktop

## Dark Mode

Todos os elementos foram implementados com suporte a dark mode:
- `bg-emerald-50 dark:bg-emerald-950/20` para produtos na cesta
- `border-emerald-200 dark:border-emerald-800` para bordas
- `text-emerald-600 dark:text-emerald-400` para textos
- `bg-card` e `border-border` para produtos fora da cesta

## Arquivos Modificados

- `src/pages/AdminBasket.tsx`: Adicionada nova seção e queries

## Como Testar

1. Faça login como admin
2. Acesse "Produtos" no menu principal
3. Role até "Todos os Produtos da Loja"
4. Clique em "Mostrar Todos"
5. Verifique se todos os produtos aparecem
6. Teste adicionar um produto fora da cesta
7. Confirme que ele move para a seção verde

## Próximos Passos (Opcional)

- Adicionar busca/filtro de produtos
- Permitir remover da cesta direto nesta visualização
- Adicionar ordenação (nome, preço, data)
- Mostrar produtos inativos separadamente
