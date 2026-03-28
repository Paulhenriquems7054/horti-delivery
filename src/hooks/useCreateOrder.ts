import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BasketProduct } from "./useActiveBasket";

export interface CreateOrderInput {
  customer_name: string;
  phone: string;
  address: string;
  total: number;
  products: BasketProduct[];
  storeId?: string;
  delivery_zone_id?: string;
  coupon_id?: string;
  delivery_fee?: number;
  discount?: number;
  notes?: string;
  email?: string;
}

export function useCreateOrder() {
  return useMutation({
    mutationFn: async (input: CreateOrderInput) => {
      // 1. Cria o pedido
      const { data: order, error: oErr } = await supabase
        .from("orders")
        .insert({
          customer_name: input.customer_name,
          phone: input.phone,
          address: input.address,
          total: input.total,
          status: "pending",
          store_id: input.storeId,
          delivery_zone_id: input.delivery_zone_id,
          coupon_id: input.coupon_id,
          delivery_fee: input.delivery_fee || 0,
          discount: input.discount || 0,
          notes: input.notes,
          email: input.email,
        })
        .select()
        .single();

      if (oErr) throw oErr;

      // 2. Cria os itens do pedido
      const orderItems = input.products.map((p) => ({
        order_id: order.id,
        product_id: p.id,
        quantity: p.quantity,
        price: p.price,
        product_name: p.name,
      }));

      const { error: iErr } = await supabase.from("order_items").insert(orderItems);

      if (iErr) throw iErr;

      // 3. Atualiza contador de uso do cupom se aplicado
      if (input.coupon_id) {
        await supabase.rpc("increment_coupon_usage", { coupon_id: input.coupon_id });
      }

      // 4. Cria tracking inicial
      await supabase.from("order_tracking").insert({
        order_id: order.id,
        status: "pending",
        notes: "Pedido recebido",
      });

      return order;
    },
  });
}
