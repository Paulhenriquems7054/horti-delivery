import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CategoryProductCounts = {
  byCategoryId: Map<string, number>;
  uncategorized: number;
  totalActive: number;
};

export function useCategoryProductCounts(storeId: string | undefined, categoryIds: string[]) {
  return useQuery({
    queryKey: ["category-product-counts", storeId, categoryIds.slice().sort().join(",")],
    queryFn: async (): Promise<CategoryProductCounts> => {
      if (!storeId) {
        return { byCategoryId: new Map(), uncategorized: 0, totalActive: 0 };
      }

      const byCategoryId = new Map<string, number>();
      let totalActive = 0;

      await Promise.all(
        categoryIds.map(async (categoryId) => {
          const { count, error } = await supabase
            .from("products")
            .select("*", { count: "exact", head: true })
            .eq("store_id", storeId)
            .eq("active", true)
            .eq("category_id", categoryId);
          if (error) throw error;
          const n = count ?? 0;
          byCategoryId.set(categoryId, n);
          totalActive += n;
        }),
      );

      const { count: uncategorizedCount, error: uncErr } = await supabase
        .from("products")
        .select("*", { count: "exact", head: true })
        .eq("store_id", storeId)
        .eq("active", true)
        .is("category_id", null);
      if (uncErr) throw uncErr;

      const uncategorized = uncategorizedCount ?? 0;
      totalActive += uncategorized;

      return { byCategoryId, uncategorized, totalActive };
    },
    enabled: !!storeId && categoryIds.length > 0,
    staleTime: 60_000,
  });
}
