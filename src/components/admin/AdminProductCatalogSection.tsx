import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Package, Search } from "lucide-react";
import { useCategories } from "@/hooks/useCategories";
import {
  ADMIN_CATALOG_PAGE_SIZE,
  type AdminCatalogFilter,
  useAdminCatalogProducts,
} from "@/hooks/useAdminCatalogProducts";

interface Props {
  storeId: string | undefined;
}

const FILTER_LABELS: Record<AdminCatalogFilter, string> = {
  active: "Ativos",
  inactive: "Inativos",
  uncategorized: "Sem categoria",
};

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
  const totalPages = Math.max(1, Math.ceil((query.data?.totalCount ?? 0) / ADMIN_CATALOG_PAGE_SIZE));

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(0);
  };

  const handleFilterChange = (next: AdminCatalogFilter) => {
    setFilter(next);
    setPage(0);
  };

  return (
    <section className="bg-card p-5 rounded-2xl shadow-sm border border-border space-y-4">
      <div>
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          Catálogo
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Listagem paginada do banco. Busca por nome, código interno ou código de barras.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(FILTER_LABELS) as AdminCatalogFilter[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => handleFilterChange(key)}
            className={`h-8 px-3 rounded-lg text-xs font-bold border transition-colors ${
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
        <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Buscar produto, código interno ou EAN…"
          className="w-full h-10 pl-9 pr-3 border border-border rounded-lg text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {query.isLoading ? (
        <div className="text-center py-6">
          <Loader2 className="h-6 w-6 text-primary animate-spin mx-auto" />
        </div>
      ) : (query.data?.products.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Nenhum produto encontrado para este filtro.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left p-2 font-bold">Nome</th>
                <th className="text-left p-2 font-bold">Cód.</th>
                <th className="text-left p-2 font-bold">EAN</th>
                <th className="text-left p-2 font-bold">Categoria</th>
                <th className="text-right p-2 font-bold">Preço</th>
                <th className="text-center p-2 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.products.map((product) => (
                <tr key={product.id} className="border-t border-border">
                  <td className="p-2 font-medium text-foreground max-w-[220px] truncate" title={product.name}>
                    {product.name}
                  </td>
                  <td className="p-2 text-muted-foreground">{product.internal_code ?? "—"}</td>
                  <td className="p-2 text-muted-foreground">{product.barcode ?? "—"}</td>
                  <td className="p-2 text-muted-foreground">
                    {product.category_id
                      ? categoryNameById.get(product.category_id) ?? "—"
                      : "Sem categoria"}
                  </td>
                  <td className="p-2 text-right font-semibold">
                    R$ {Number(product.price).toFixed(2).replace(".", ",")}
                  </td>
                  <td className="p-2 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                        product.active
                          ? product.in_stock === false
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {!product.active ? "Inativo" : product.in_stock === false ? "Esgotado" : "Ativo"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {query.data?.totalCount ?? 0} produto(s) · página {page + 1} de {totalPages}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="h-8 w-8 rounded-lg border border-border flex items-center justify-center disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="h-8 w-8 rounded-lg border border-border flex items-center justify-center disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
