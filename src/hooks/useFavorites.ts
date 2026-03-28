import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Favorite {
  id: string;
  customer_phone: string;
  product_id: string;
  created_at: string;
}

export function useFavorites(customerPhone?: string) {
  return useQuery({
    queryKey: ["favorites", customerPhone],
    queryFn: async () => {
      if (!customerPhone) return [];
      const { data, error } = await supabase
        .from("favorites")
        .select("*")
        .eq("customer_phone", customerPhone);
      if (error) throw error;
      return data as Favorite[];
    },
    enabled: !!customerPhone,
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ customerPhone, productId }: { customerPhone: string; productId: string }) => {
      // Check if already favorited
      const { data: existing } = await supabase
        .from("favorites")
        .select("id")
        .eq("customer_phone", customerPhone)
        .eq("product_id", productId)
        .single();
      
      if (existing) {
        // Remove favorite
        const { error } = await supabase.from("favorites").delete().eq("id", existing.id);
        if (error) throw error;
        return { action: "removed" };
      } else {
        // Add favorite
        const { error } = await supabase
          .from("favorites")
          .insert({ customer_phone: customerPhone, product_id: productId });
        if (error) throw error;
        return { action: "added" };
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["favorites", variables.customerPhone] });
    },
  });
}
