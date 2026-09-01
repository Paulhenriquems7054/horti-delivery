import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Package, Search } from "lucide-react";
import { useCategories } from "@/hooks/useCategories";
import {
  ADMIN_CATALOG_PAGE_SIZE,
  type AdminCatalogFilter,
  type AdminCatalogProduct,
  useAdminCatalogProducts,
} from "@/hooks/useAdminCatalogProducts";
import { isProductInStock, useToggleProductInStock } from "@/hooks/useToggleProductInStock";

interface Props {
  storeId: string | undefined;
}

const FILTER_LABELS: Record<AdminCatalogFilter, string> = {
  active: "Ativos",
  inactive: "Inativos",
  uncategorized: "Sem categoria",
};

function formatPrice(price: number): string {
  return `R$ ${Number(price).toFixed(2).replace(".", ",")}`;
}

function AvailabilityToggle({
  product,
  isToggling,
  onToggle,
  className = "",
  compact = false,
}: {
  product: AdminCatalogProduct;
  isToggling: boolean;
  onToggle: () => void;
  className?: string;
  compact?: boolean;
}) {
  if (!product.active) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-md font-bold uppercase bg-gray-100 text-gray-600 ${
          compact ? "px-2 py-1 text-[9px]" : "px-2.5 py-1.5 text-[10px]"
        }`}
      >
        Inativo
      </span>
    );
  }

  const available = isProductInStock(product.in_stock);

  return (
    <button
      type="button"
      disabled={isToggling}
      onClick={onToggle}
      title={
        available
          ? "Clique para marcar como indisponível no catálogo"
          : "Clique para marcar como disponível no catálogo"
      }
      className={`text-center uppercase font-bold rounded-md border transition-colors whitespace-nowrap disabled:opacity-60 cursor-pointer ${
        compact
          ? "w-full px-1.5 py-1 text-[9px] min-w-0"
          : "w-full sm:w-auto min-w-[7.5rem] px-2.5 py-1.5 text-[10px]"
      } ${
        available
          ? "bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200"
          : "bg-red-100 text-red-800 border-red-200 hover:bg-red-200"
      } ${className}`}
    >
      {isToggling ? (
        <Loader2 className={`animate-spin mx-auto ${compact ? "h-3 w-3" : "h-3.5 w-3.5"}`} />
      ) : available ? (
        "Disponível"
      ) : (
        "Indisponível"
      )}
    </button>
  );
}

function CatalogProductCard({
  product,
  categoryName,
  isToggling,
  onToggle,
}: {
  product: AdminCatalogProduct;
  categoryName: string;
  isToggling: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="rounded-xl border border-border bg-muted/20 p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-foreground break-words leading-snug min-w-0 flex-1">
          {product.name}
        </p>
        <span className="text-sm font-bold text-foreground shrink-0">{formatPrice(product.price)}</span>
      </div>
      <dl className="grid grid-cols-1 gap-1 text-[11px] text-muted-foreground">
        <div className="flex gap-2">
          <dt className="font-semibold shrink-0">Cód.</dt>
          <dd className="break-all">{product.internal_code ?? "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-semibold shrink-0">EAN</dt>
          <dd className="break-all">{product.barcode ?? "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-semibold shrink-0">Cat.</dt>
          <dd className="break-words">{categoryName}</dd>
        </div>
      </dl>
      <AvailabilityToggle product={product} isToggling={isToggling} onToggle={onToggle} />
    </li>
  );
}

export function AdminProductCatalogSection({ storeId }: Props) {
  const [filter, setFilter] = useState<AdminCatalogFilter>("active");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const { data: categories = [] } = useCategories(storeId);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) map.set(cat.id, cat.name);
    return map;
  }, [categories]);

  const query = useAdminCatalogProducts(storeId, filter, search, page);
  const toggleStock = useToggleProductInStock(storeId);
  const totalPages = Math.max(1, Math.ceil((query.data?.totalCount ?? 0) / ADMIN_CATALOG_PAGE_SIZE));
  const products = query.data?.products ?? [];

  const getCategoryName = (product: AdminCatalogProduct) =>
    product.category_id ? categoryNameById.get(product.category_id) ?? "—" : "Sem categoria";

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(0);
  };

  const handleFilterChange = (next: AdminCatalogFilter) => {
    setFilter(next);
    setPage(0);
  };

  const handleToggle = (product: AdminCatalogProduct) => {
    toggleStock.mutate({
      productId: product.id,
      inStock: !isProductInStock(product.in_stock),
    });
  };

  return (
    <section className="bg-card p-4 sm:p-5 rounded-2xl shadow-sm border border-border space-y-4 min-w-0">
      <div>
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Package className="h-4 w-4 text-primary shrink-0" />
          Catálogo
        </h2>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Toque em <strong>Disponível</strong> ou <strong>Indisponível</strong> para alternar o que o
          cliente vê no catálogo.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
        {(Object.keys(FILTER_LABELS) as AdminCatalogFilter[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => handleFilterChange(key)}
            className={`h-9 sm:h-8 px-2 sm:px-3 rounded-lg text-[11px] sm:text-xs font-bold border transition-colors ${
              filter === key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            {FILTER_LABELS[key]}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Buscar nome, código ou EAN…"
          className="w-full h-11 sm:h-10 pl-9 pr-3 border border-border rounded-lg text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {query.isLoading ? (
        <div className="text-center py-8">
          <Loader2 className="h-6 w-6 text-primary animate-spin mx-auto" />
        </div>
      ) : products.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhum produto encontrado para este filtro.
        </p>
      ) : (
        <>
          {/* Cards até lg — evita tabela espremida em tablets e painéis estreitos */}
          <ul className="lg:hidden space-y-2">
            {products.map((product) => (
              <CatalogProductCard
                key={product.id}
                product={product}
                categoryName={getCategoryName(product)}
                isToggling={
                  toggleStock.isPending && toggleStock.variables?.productId === product.id
                }
                onToggle={() => handleToggle(product)}
              />
            ))}
          </ul>

          {/* Tabela em telas largas — corpo rolável com cabeçalho fixo */}
          <div className="hidden lg:block rounded-xl border border-border overflow-hidden">
            <div className="max-h-[min(70vh,32rem)] overflow-auto">
              <table className="w-full table-fixed text-xs">
                <thead className="bg-muted/90 text-muted-foreground sticky top-0 z-10 shadow-[0_1px_0_0_hsl(var(--border))]">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-bold w-[32%]">Nome</th>
                    <th className="text-left px-2 py-2.5 font-bold w-[9%]">Cód.</th>
                    <th className="text-left px-2 py-2.5 font-bold w-[11%] hidden xl:table-cell">EAN</th>
                    <th className="text-left px-2 py-2.5 font-bold w-[20%]">Categoria</th>
                    <th className="text-right px-2 py-2.5 font-bold w-[10%]">Preço</th>
                    <th className="text-center px-2 py-2.5 font-bold w-[18%]">Disponível</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const isToggling =
                      toggleStock.isPending && toggleStock.variables?.productId === product.id;

                    return (
                      <tr key={product.id} className="border-t border-border hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium text-foreground align-middle">
                          <span className="line-clamp-2 break-words" title={product.name}>
                            {product.name}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-muted-foreground align-middle break-all">
                          {product.internal_code ?? "—"}
                        </td>
                        <td className="px-2 py-2 text-muted-foreground align-middle break-all hidden xl:table-cell">
                          {product.barcode ?? "—"}
                        </td>
                        <td className="px-2 py-2 text-muted-foreground align-middle">
                          <span className="line-clamp-2 break-words">{getCategoryName(product)}</span>
                        </td>
                        <td className="px-2 py-2 text-right font-semibold align-middle whitespace-nowrap">
                          {formatPrice(product.price)}
                        </td>
                        <td className="px-2 py-2 align-middle">
                          <AvailabilityToggle
                            product={product}
                            isToggling={isToggling}
                            onToggle={() => handleToggle(product)}
                            compact
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs text-muted-foreground pt-1">
        <span className="text-center sm:text-left">
          {(query.data?.totalCount ?? 0).toLocaleString("pt-BR")} produto(s) · página {page + 1} de{" "}
          {totalPages}
        </span>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="h-9 w-9 rounded-lg border border-border flex items-center justify-center disabled:opacity-40 hover:bg-muted"
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[4rem] text-center font-semibold text-foreground">
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="h-9 w-9 rounded-lg border border-border flex items-center justify-center disabled:opacity-40 hover:bg-muted"
            aria-label="Próxima página"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
