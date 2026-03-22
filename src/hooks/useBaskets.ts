import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/services/supabase";

export interface Basket {
  id: string;
  name: string;
  price: number;
  active: boolean;
  created_at: string;
}

export interface BasketItemWithProduct {
  id: string;
  basket_id: string;
  product_id: string;
  quantity: number;
  product_name?: string;
}

export function useBaskets() {
  return useQuery({
    queryKey: ["baskets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baskets")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Basket[];
    },
  });
}

export function useBasketItems(basketId: string | null) {
  return useQuery({
    queryKey: ["basket-items", basketId],
    enabled: !!basketId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("basket_items")
        .select("*, products(name)")
        .eq("basket_id", basketId!);
      if (error) throw error;
      return (data || []).map((item: any) => ({
        id: item.id,
        basket_id: item.basket_id,
        product_id: item.product_id,
        quantity: item.quantity,
        product_name: item.products?.name,
      })) as BasketItemWithProduct[];
    },
  });
}

export function useCreateBasket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; price: number; active?: boolean }) => {
      const { data, error } = await supabase
        .from("baskets")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["baskets"] });
      qc.invalidateQueries({ queryKey: ["active-basket"] });
    },
  });
}

export function useUpdateBasket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<Basket> & { id: string }) => {
      const { error } = await supabase
        .from("baskets")
        .update(input)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["baskets"] });
      qc.invalidateQueries({ queryKey: ["active-basket"] });
    },
  });
}

export function useDeleteBasket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("baskets")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["baskets"] });
      qc.invalidateQueries({ queryKey: ["active-basket"] });
    },
  });
}

export function useAddBasketItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { basket_id: string; product_id: string; quantity: number }) => {
      const { error } = await supabase
        .from("basket_items")
        .insert(input);
      if (error) throw error;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["basket-items", vars.basket_id] }),
  });
}

export function useUpdateBasketItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, basket_id, quantity }: { id: string; basket_id: string; quantity: number }) => {
      const { error } = await supabase
        .from("basket_items")
        .update({ quantity })
        .eq("id", id);
      if (error) throw error;
      return basket_id;
    },
    onSuccess: (basketId) => qc.invalidateQueries({ queryKey: ["basket-items", basketId] }),
  });
}

export function useDeleteBasketItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, basket_id }: { id: string; basket_id: string }) => {
      const { error } = await supabase
        .from("basket_items")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return basket_id;
    },
    onSuccess: (basketId) => qc.invalidateQueries({ queryKey: ["basket-items", basketId] }),
  });
}
