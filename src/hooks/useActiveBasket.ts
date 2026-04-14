import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BasketProduct {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  unit: string;
  quantity: number;
  in_stock?: boolean;
  description?: string;
  category_id?: string;
  sell_by: "unit" | "weight" | "both";
  price_per_kg?: number;
  min_weight?: number;
  step_weight?: number;
  average_weight?: number;
  weight_variance?: number;
  price_per_unit?: number;
}

export interface ActiveBasket {
  id: string;
  name: string;
  price: number;
  products: BasketProduct[];
}

export function useActiveBasket(storeId?: string) {
  return useQuery<ActiveBasket | null>({
    queryKey: ["active-basket", storeId],
    queryFn: async () => {
      // 1. Busca a cesta ativa — tenta filtrar por store_id se disponível,
      //    mas cai no fallback global se não encontrar nada
      let basket: any = null;

      if (storeId) {
        const { data, error } = await supabase
          .from("baskets")
          .select("*")
          .eq("store_id", storeId)
          .eq("active", true)
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        basket = data;
      }

      // Fallback: pega qualquer cesta ativa (sem filtro de loja)
      if (!basket) {
        const { data, error } = await supabase
          .from("baskets")
          .select("*")
          .eq("active", true)
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        basket = data;
      }

      if (!basket) return null;

      const effectiveStoreId = storeId || (basket as any).store_id;
      if (!effectiveStoreId) return null;

      // 2. Busca todos os produtos ativos da loja
      const { data: productsData, error: pErr } = await supabase
        .from("products")
        .select("id, name, price, image_url, unit, description, category_id, active, in_stock, sell_by, price_per_kg, min_weight, step_weight, average_weight, weight_variance, price_per_unit")
        .eq("store_id", effectiveStoreId)
        .eq("active", true)
        .order("name");

      if (pErr) throw pErr;

      const products: BasketProduct[] = (productsData ?? []).map((product: any) => ({
        id: product.id,
        name: product.name,
        price: product.price,
        image_url: product.image_url,
        unit: product.unit || "un",
        quantity: 1,
        in_stock: product.in_stock,
        description: product.description,
        category_id: product.category_id,
        sell_by: product.sell_by || "unit",
        price_per_kg: product.price_per_kg,
        min_weight: product.min_weight || 0.25,
        step_weight: product.step_weight || 0.25,
        average_weight: product.average_weight,
        weight_variance: product.weight_variance ?? 0.15,
        price_per_unit: product.price_per_unit,
      }));

      return {
        id: basket.id,
        name: basket.name,
        price: basket.price,
        products,
      };
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });
}
