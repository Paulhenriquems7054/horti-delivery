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

function getCouponExpiryDate(expiresAt?: string) {
  if (!expiresAt) return null;

  // Date-only values (YYYY-MM-DD) are valid until local end of day.
  const dateOnlyMatch = expiresAt.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]) - 1;
    const day = Number(dateOnlyMatch[3]);
    return new Date(year, month, day, 23, 59, 59, 999);
  }

  return new Date(expiresAt);
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
    mutationFn: async ({
      code,
      storeSlug,
      storeId,
      orderTotal,
    }: {
      code: string;
      storeSlug?: string;
      storeId?: string;
      orderTotal: number;
    }) => {
      const slug = storeSlug;
      if (!slug) throw new Error("Loja não identificada");
      const { data, error } = await supabase.rpc("preview_coupon", {
        p_store_slug: slug,
        p_code: code,
        p_subtotal: orderTotal,
      });
      if (error) throw new Error(error.message || "Cupom inválido");
      const preview = data as {
        id: string;
        code: string;
        discount_type: "percentage" | "fixed";
        discount_value: number;
        discount: number;
      };
      return {
        id: preview.id,
        code: preview.code,
        discount_type: preview.discount_type,
        discount_value: preview.discount_value,
        min_order: 0,
        used_count: 0,
        active: true,
      } as Coupon;
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
