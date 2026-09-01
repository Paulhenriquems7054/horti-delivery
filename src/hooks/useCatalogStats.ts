import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CatalogStats = {
  totalActive: number;
  withCategory: number;
  withoutCategory: number;
  totalInactive: number;
  lastCatalogActivityAt: string | null;
};

export const CATALOG_STATS_KEY = "catalog-stats";

export function catalogStatsQueryKey(storeId: string | undefined) {
  return [CATALOG_STATS_KEY, storeId] as const;
}

async function countProducts(
  storeId: string,
  filters: { active?: boolean; hasCategory?: boolean },
): Promise<number> {
  let query = supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("store_id", storeId);

  if (filters.active !== undefined) {
    query = query.eq("active", filters.active);
  }
  if (filters.hasCategory === true) {
    query = query.not("category_id", "is", null);
  } else if (filters.hasCategory === false) {
    query = query.is("category_id", null);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export function useCatalogStats(storeId: string | undefined) {
  return useQuery({
    queryKey: catalogStatsQueryKey(storeId),
    queryFn: async (): Promise<CatalogStats> => {
      if (!storeId) {
        return {
          totalActive: 0,
          withCategory: 0,
          withoutCategory: 0,
          totalInactive: 0,
          lastCatalogActivityAt: null,
        };
      }

      const [withCategory, withoutCategory, totalInactive, lastImport] = await Promise.all([
        countProducts(storeId, { active: true, hasCategory: true }),
        countProducts(storeId, { active: true, hasCategory: false }),
        countProducts(storeId, { active: false }),
        supabase
          .from("product_imports")
          .select("finished_at, started_at")
          .eq("store_id", storeId)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const totalActive = withCategory + withoutCategory;
      const importRow = lastImport.data as { finished_at?: string | null; started_at?: string } | null;

      return {
        totalActive,
        withCategory,
        withoutCategory,
        totalInactive,
        lastCatalogActivityAt: importRow?.finished_at ?? importRow?.started_at ?? null,
      };
    },
    enabled: !!storeId,
    staleTime: 30_000,
  });
}
