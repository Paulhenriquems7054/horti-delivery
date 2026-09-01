import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const ADMIN_CATALOG_PAGE_SIZE = 50;

export type AdminCatalogFilter = "active" | "inactive" | "uncategorized";

export type AdminCatalogProduct = {
  id: string;
  name: string;
  price: number;
  active: boolean;
  internal_code: string | null;
  barcode: string | null;
  category_id: string | null;
  in_stock: boolean | null;
  unit: string | null;
};

export function adminCatalogQueryKey(
  storeId: string | undefined,
  filter: AdminCatalogFilter,
  search: string,
  page: number,
) {
  return ["admin-catalog-products", storeId, filter, search.trim().toLowerCase(), page] as const;
}

export function useAdminCatalogProducts(
  storeId: string | undefined,
  filter: AdminCatalogFilter,
  search: string,
  page: number,
) {
  return useQuery({
    queryKey: adminCatalogQueryKey(storeId, filter, search, page),
    queryFn: async () => {
      if (!storeId) {
        return { products: [] as AdminCatalogProduct[], totalCount: 0, page: 0 };
      }

      const from = page * ADMIN_CATALOG_PAGE_SIZE;
      const to = from + ADMIN_CATALOG_PAGE_SIZE - 1;
      const q = search.trim();

      let query = supabase
        .from("products")
        .select(
          "id, name, price, active, internal_code, barcode, category_id, in_stock, unit",
          { count: "exact" },
        )
        .eq("store_id", storeId)
        .order("name", { ascending: true });

      if (filter === "active") {
        query = query.eq("active", true);
      } else if (filter === "inactive") {
        query = query.eq("active", false);
      } else {
        query = query.eq("active", true).is("category_id", null);
      }

      if (q) {
        query = query.or(
          `name.ilike.%${q}%,internal_code.ilike.%${q}%,barcode.ilike.%${q}%`,
        );
      }

      const { data, error, count } = await query.range(from, to);
      if (error) throw error;

      return {
        products: (data ?? []) as AdminCatalogProduct[],
        totalCount: count ?? 0,
        page,
      };
    },
    enabled: !!storeId,
    staleTime: 15_000,
  });
}
