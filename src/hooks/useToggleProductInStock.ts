import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function isProductInStock(inStock: boolean | null | undefined): boolean {
  return inStock !== false;
}

export function useToggleProductInStock(storeId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ productId, inStock }: { productId: string; inStock: boolean }) => {
      let query = supabase
        .from("products")
        .update({ in_stock: inStock })
        .eq("id", productId);

      if (storeId) {
        query = query.eq("store_id", storeId);
      }

      const { data, error } = await query.select("id").maybeSingle();

      if (error) {
        if (error.message.includes("in_stock")) {
          throw new Error(
            "Coluna in_stock ausente no banco. Aplique a migration 20260901140000_add_product_in_stock.sql no Supabase.",
          );
        }
        throw error;
      }
      if (!data) {
        throw new Error("Produto não encontrado ou sem permissão para alterar.");
      }
    },
    onSuccess: (_data, { inStock }) => {
      toast.success(
        inStock
          ? "Produto disponível no catálogo dos clientes."
          : "Produto indisponível no catálogo dos clientes.",
      );
      queryClient.invalidateQueries({ queryKey: ["admin-catalog-products"] });
      queryClient.invalidateQueries({ queryKey: ["store-catalog-products"] });
      if (storeId) {
        queryClient.invalidateQueries({ queryKey: ["admin-store-products", storeId] });
        queryClient.invalidateQueries({ queryKey: ["admin-active-basket"] });
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Não foi possível atualizar a disponibilidade.");
    },
  });
}
