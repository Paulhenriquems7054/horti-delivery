import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BasketProduct } from "@/hooks/useActiveBasket";
import { CATALOG_PAGE_SIZE } from "@/lib/catalog/constants";

export { CATALOG_PAGE_SIZE };

const PRODUCT_SELECT =
  "id, name, price, image_url, unit, description, category_id, active, in_stock, sell_by, price_per_kg, min_weight, step_weight, average_weight, weight_variance, price_per_unit";

function mapRow(product: Record<string, unknown>): BasketProduct {
  return {
    id: product.id as string,
    name: product.name as string,
    price: product.price as number,
    image_url: (product.image_url as string | null) ?? null,
    unit: (product.unit as string) || "un",
    quantity: 1,
    in_stock: product.in_stock as boolean | undefined,
    description: product.description as string | undefined,
    category_id: product.category_id as string | undefined,
    sell_by: (product.sell_by as BasketProduct["sell_by"]) || "unit",
    price_per_kg: product.price_per_kg as number | undefined,
    min_weight: (product.min_weight as number) || 0.25,
    step_weight: (product.step_weight as number) || 0.25,
    average_weight: product.average_weight as number | undefined,
    weight_variance: (product.weight_variance as number | undefined) ?? 0.15,
    price_per_unit: product.price_per_unit as number | undefined,
  };
}

export interface StoreCatalogPage {
  products: BasketProduct[];
  totalCount: number;
  page: number;
  hasMore: boolean;
}

export function storeCatalogQueryKey(
  storeId: string | undefined,
  categoryIds: string[],
  searchQuery: string,
) {
  const categoriesKey = [...categoryIds].sort().join(",");
  return ["store-catalog-products", storeId, categoriesKey, searchQuery.trim().toLowerCase()] as const;
}

export function useStoreCatalogProducts(
  storeId: string | undefined,
  categoryIds: string[],
  searchQuery: string,
) {
  return useInfiniteQuery({
    queryKey: storeCatalogQueryKey(storeId, categoryIds, searchQuery),
    queryFn: async ({ pageParam = 0 }): Promise<StoreCatalogPage> => {
      if (!storeId || categoryIds.length === 0) {
        return { products: [], totalCount: 0, page: 0, hasMore: false };
      }

      const from = pageParam * CATALOG_PAGE_SIZE;
      const to = from + CATALOG_PAGE_SIZE - 1;
      const q = searchQuery.trim();

      let query = supabase
        .from("products")
        .select(PRODUCT_SELECT, { count: "exact" })
        .eq("store_id", storeId)
        .eq("active", true)
        .in("category_id", categoryIds)
        .order("name", { ascending: true });

      if (q) {
        query = query.ilike("name", `%${q}%`);
      }

      const { data, error, count } = await query.range(from, to);
      if (error) throw error;

      const products = (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
      const totalCount = count ?? products.length;

      return {
        products,
        totalCount,
        page: pageParam,
        hasMore: from + products.length < totalCount,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    enabled: !!storeId && categoryIds.length > 0,
    staleTime: 30_000,
  });
}

export function flattenCatalogPages(
  pages: StoreCatalogPage[] | undefined,
): BasketProduct[] {
  if (!pages) return [];
  const seen = new Set<string>();
  const out: BasketProduct[] = [];
  for (const page of pages) {
    for (const p of page.products) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}
