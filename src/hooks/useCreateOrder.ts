import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BasketProduct } from "./useActiveBasket";

export interface CreateOrderLine extends BasketProduct {
  item_notes?: string;
}

export interface CreateOrderInput {
  customer_name: string;
  phone: string;
  address: string;
  products: CreateOrderLine[];
  storeSlug: string;
  delivery_zone_id?: string;
  coupon_code?: string;
  notes?: string;
  email?: string;
  payment_method?: "credit" | "debit" | "cash" | "pix";
  privacy_acknowledged?: boolean;
}

export function useCreateOrder() {
  return useMutation({
    mutationFn: async (input: CreateOrderInput) => {
      const items = input.products.map((p) => {
        const base = {
          product_id: p.id,
          item_notes: p.item_notes?.trim() || null,
        };
        if (p.sold_by === "weight") {
          return {
            ...base,
            sold_by: "weight",
            weight_kg: p.weight_kg,
          };
        }
        return {
          ...base,
          sold_by: "unit",
          quantity: p.quantity || 1,
        };
      });

      const { data, error } = await supabase.rpc("create_customer_order", {
        p_store_slug: input.storeSlug,
        p_customer_name: input.customer_name,
        p_phone: input.phone,
        p_address: input.address,
        p_items: items,
        p_coupon_code: input.coupon_code ?? null,
        p_delivery_zone_id: input.delivery_zone_id ?? null,
        p_payment_method: input.payment_method || "cash",
        p_notes: input.notes ?? null,
        p_email: input.email ?? null,
        p_privacy_acknowledged: input.privacy_acknowledged ?? false,
      });

      if (error) throw error;
      return data as { id: string; total: number; discount: number; delivery_fee: number; store_id: string };
    },
  });
}

export function useReprintOrder() {
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.rpc("reprint_order", {
        p_order_id: orderId,
      });
      if (error) throw error;
      return data as string | null;
    },
  });
}
