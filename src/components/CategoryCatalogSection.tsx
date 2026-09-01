import { Loader2, Package } from "lucide-react";
import { ProductCard } from "@/components/ProductCard";
import type { BasketProduct } from "@/hooks/useActiveBasket";
import type { Category } from "@/hooks/useCategories";
import {
  flattenCatalogPages,
  useStoreCatalogProducts,
} from "@/hooks/useStoreCatalogProducts";
import { CATALOG_CATEGORY_SEEDS } from "@/lib/productCategory/classifyProduct";
import type { ResolvedCartLine } from "@/types/cart";

function shortLabelFor(name: string): string {
  const seed = CATALOG_CATEGORY_SEEDS.find((s) => s.name === name);
  return seed?.shortLabel ?? name;
}

interface Props {
  storeId: string;
  category: Category;
  searchQuery: string;
  getProductMode: (product: BasketProduct) => "unit" | "weight";
  productMode: Record<string, "unit" | "weight">;
  resolvedCartLines: ResolvedCartLine[];
  onAdd: (product: BasketProduct) => void;
  onRemove: (product: BasketProduct) => void;
  onSelectWeight: (product: BasketProduct) => void;
  onToggleMode: (productId: string) => void;
}

export function CategoryCatalogSection({
  storeId,
  category,
  searchQuery,
  getProductMode,
  productMode,
  resolvedCartLines,
  onAdd,
  onRemove,
  onSelectWeight,
  onToggleMode,
}: Props) {
  const {
    data: catalogPages,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useStoreCatalogProducts(storeId, [category.id], searchQuery);

  const products = flattenCatalogPages(catalogPages?.pages);
  const totalCount = catalogPages?.pages[0]?.totalCount ?? products.length;

  return (
    <section className="space-y-3" aria-labelledby={`catalog-cat-${category.id}`}>
      <div className="flex items-center justify-between gap-2 px-1">
        <h4
          id={`catalog-cat-${category.id}`}
          className="text-sm font-extrabold text-foreground inline-flex items-center gap-1.5"
        >
          {category.icon ? <span aria-hidden>{category.icon}</span> : null}
          {shortLabelFor(category.name)}
        </h4>
        {!isLoading && !isError && totalCount > 0 ? (
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {products.length.toLocaleString("pt-BR")}
            {hasNextPage ? ` de ${totalCount.toLocaleString("pt-BR")}+` : ` de ${totalCount.toLocaleString("pt-BR")}`}
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : null}

      {isError ? (
        <div className="text-center py-6 rounded-xl border border-destructive/30 bg-destructive/5">
          <p className="text-sm text-destructive">Não foi possível carregar esta categoria.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 text-sm font-bold text-primary underline"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {!isLoading && !isError && products.length === 0 ? (
        <div className="text-center py-6 rounded-xl border border-dashed border-border bg-card/40">
          <Package className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">
            {searchQuery
              ? "Nenhum produto nesta categoria para esta busca."
              : "Nenhum produto disponível nesta categoria."}
          </p>
        </div>
      ) : null}

      {!isLoading && !isError
        ? products.map((p, i) => {
            const mode = getProductMode(p);
            const productLines = resolvedCartLines.filter((l) => l.productId === p.id);
            const cartQty = productLines
              .filter((l) => l.soldBy === "unit")
              .reduce((s, l) => s + l.quantity, 0);
            const cartWeight = productLines
              .filter((l) => l.soldBy === "weight")
              .reduce((s, l) => s + l.weightKg, 0);

            return (
              <div
                key={p.id}
                className="animate-slide-up"
                style={{ animationDelay: `${i * 30}ms`, opacity: 0 }}
              >
                <ProductCard
                  product={p}
                  cartQty={mode === "unit" ? cartQty : productLines.filter((l) => l.soldBy === "weight").length}
                  cartWeight={cartWeight > 0 ? cartWeight : undefined}
                  onAdd={() => onAdd(p)}
                  onRemove={() => onRemove(p)}
                  onSelectWeight={() => onSelectWeight(p)}
                  selectedMode={productMode[p.id]}
                  onToggleMode={() => onToggleMode(p.id)}
                />
              </div>
            );
          })
        : null}

      {!isLoading && !isError && hasNextPage ? (
        <button
          type="button"
          disabled={isFetchingNextPage}
          onClick={() => fetchNextPage()}
          className="w-full h-10 rounded-xl border border-border bg-card text-xs font-bold text-foreground hover:bg-muted disabled:opacity-60 inline-flex items-center justify-center gap-2"
        >
          {isFetchingNextPage ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Carregando...
            </>
          ) : (
            <>Carregar mais em {shortLabelFor(category.name)}</>
          )}
        </button>
      ) : null}
    </section>
  );
}
