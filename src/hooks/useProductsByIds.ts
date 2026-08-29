import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BasketProduct } from "@/hooks/useActiveBasket";

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

export function useProductsByIds(storeId: string | undefined, productIds: string[]) {
  const sortedKey = [...productIds].sort().join(",");

  return useQuery({
    queryKey: ["products-by-ids", storeId, sortedKey],
    queryFn: async (): Promise<BasketProduct[]> => {
      if (!storeId || productIds.length === 0) return [];

      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("store_id", storeId)
        .eq("active", true)
        .in("id", productIds);

      if (error) throw error;
      return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
    },
    enabled: !!storeId && productIds.length > 0,
    staleTime: 30_000,
  });
}
