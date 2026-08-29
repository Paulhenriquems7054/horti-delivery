import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Tags, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCategories } from "@/hooks/useCategories";
import { classifyProductName } from "@/lib/productCategory/classifyProduct";

interface Props {
  storeId: string | undefined;
}

type UncategorizedProduct = {
  id: string;
  name: string;
  price: number;
  internal_code?: string | null;
};

export function ProductCategoryReview({ storeId }: Props) {
  const queryClient = useQueryClient();
  const { data: categories = [] } = useCategories(storeId);
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  const productsQuery = useQuery({
    queryKey: ["admin-uncategorized-products", storeId],
    queryFn: async () => {
      if (!storeId) return [];
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, internal_code")
        .eq("store_id", storeId)
        .eq("active", true)
        .is("category_id", null)
        .order("name")
        .limit(500);
      if (error) throw error;
      return (data ?? []) as UncategorizedProduct[];
    },
    enabled: !!storeId,
  });

  const suggestions = useMemo(() => {
    const map = new Map<string, ReturnType<typeof classifyProductName>>();
    for (const product of productsQuery.data ?? []) {
      map.set(product.id, classifyProductName(product.name));
    }
    return map;
  }, [productsQuery.data]);

  const categoryIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) map.set(cat.name, cat.id);
    return map;
  }, [categories]);

  const ensureCategories = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("ensure_store_catalog_categories");
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories", storeId] });
      toast.success("Categorias da loja prontas");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveAssignments = useMutation({
    mutationFn: async (items: Array<{ product_id: string; category_id: string }>) => {
      const { data, error } = await supabase.rpc("assign_product_categories_batch", {
        p_assignments: items,
      });
      if (error) throw error;
      return data as { updated?: number; skipped?: number };
    },
    onSuccess: (result) => {
      toast.success(`${result.updated ?? 0} produto(s) categorizados`);
      setAssignments({});
      queryClient.invalidateQueries({ queryKey: ["admin-uncategorized-products", storeId] });
      queryClient.invalidateQueries({ queryKey: ["admin-store-products", storeId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const applyAutoClassified = () => {
    const next: Record<string, string> = { ...assignments };
    let count = 0;
    for (const product of productsQuery.data ?? []) {
      const suggestion = suggestions.get(product.id);
      if (suggestion?.status !== "CLASSIFIED" || !suggestion.categoryName) continue;
      const categoryId = categoryIdByName.get(suggestion.categoryName);
      if (!categoryId) continue;
      next[product.id] = categoryId;
      count += 1;
    }
    setAssignments(next);
    toast.message(`${count} sugestões de alta confiança aplicadas (ainda não salvas)`);
  };

  const pendingSave = Object.entries(assignments)
    .filter(([, categoryId]) => !!categoryId)
    .map(([product_id, category_id]) => ({ product_id, category_id }));

  const products = productsQuery.data ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Tags className="h-4 w-4" />
            Revisão de categorias
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Produtos sem categoria não entram no filtro por botão da vitrine. Classificações ambíguas
            exigem escolha manual.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => ensureCategories.mutate()}
            disabled={ensureCategories.isPending}
            className="h-9 px-3 rounded-lg border text-xs font-bold"
          >
            {ensureCategories.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Garantir 9 categorias"}
          </button>
          <button
            type="button"
            onClick={applyAutoClassified}
            disabled={products.length === 0 || categories.length === 0}
            className="h-9 px-3 rounded-lg border text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Sugerir automáticos
          </button>
          <button
            type="button"
            onClick={() => saveAssignments.mutate(pendingSave)}
            disabled={pendingSave.length === 0 || saveAssignments.isPending}
            className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50"
          >
            {saveAssignments.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `Salvar (${pendingSave.length})`}
          </button>
        </div>
      </div>

      {productsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando produtos sem categoria...</p>
      ) : products.length === 0 ? (
        <p className="text-sm text-emerald-700 font-medium">
          Todos os produtos ativos desta loja já possuem categoria.
        </p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {products.map((product) => {
            const suggestion = suggestions.get(product.id);
            return (
              <div
                key={product.id}
                className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-2 rounded-xl border border-border p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{product.name}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {product.internal_code ? `Cód. ${product.internal_code} · ` : ""}
                    {suggestion?.status ?? "UNCLASSIFIED"}
                    {suggestion?.reason ? ` — ${suggestion.reason}` : ""}
                  </p>
                </div>
                <select
                  value={assignments[product.id] ?? ""}
                  onChange={(e) =>
                    setAssignments((prev) => ({ ...prev, [product.id]: e.target.value }))
                  }
                  className="h-9 px-2 rounded-lg border border-border bg-card text-xs"
                >
                  <option value="">Escolher categoria...</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
