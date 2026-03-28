import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Coupon {
  id: string;
  store_id?: string;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  min_order: number;
  max_uses?: number;
  used_count: number;
  active: boolean;
  expires_at?: string;
  created_at: string;
}

export function useCoupons(storeId?: string) {
  return useQuery({
    queryKey: ["coupons", storeId],
    queryFn: async () => {
      let query = supabase.from("coupons").select("*");
      if (storeId) query = query.eq("store_id", storeId);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data as Coupon[];
    },
  });
}

export function useValidateCoupon() {
  return useMutation({
    mutationFn: async ({ code, storeId, orderTotal }: { code: string; storeId?: string; orderTotal: number }) => {
      let query = supabase
        .from("coupons")
        .select("*")
        .eq("code", code.toUpperCase())
        .eq("active", true)
        .single();
      
      const { data, error } = await query;
      if (error) throw new Error("Cupom inválido");
      
      const coupon = data as Coupon;
      
      // Validations
      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        throw new Error("Cupom expirado");
      }
      if (coupon.max_uses && coupon.used_count >= coupon.max_uses) {
        throw new Error("Cupom esgotado");
      }
      if (coupon.min_order > orderTotal) {
        throw new Error(`Pedido mínimo de R$ ${coupon.min_order.toFixed(2)}`);
      }
      if (storeId && coupon.store_id && coupon.store_id !== storeId) {
        throw new Error("Cupom não válido para esta loja");
      }
      
      return coupon;
    },
  });
}

export function useCreateCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (coupon: Omit<Coupon, "id" | "created_at" | "used_count">) => {
      const { data, error } = await supabase
        .from("coupons")
        .insert({ ...coupon, code: coupon.code.toUpperCase() })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coupons"] });
    },
  });
}

export function useUpdateCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Coupon> & { id: string }) => {
      const { data, error } = await supabase
        .from("coupons")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coupons"] });
    },
  });
}

export function useDeleteCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("coupons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coupons"] });
    },
  });
}
