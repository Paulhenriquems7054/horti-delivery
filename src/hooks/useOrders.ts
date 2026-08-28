import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Order {
  id: string;
  customer_name: string;
  phone: string;
  address: string;
  status: string;
  total: number;
  created_at: string;
  store_id?: string;
  delivery_fee?: number;
  discount?: number;
  notes?: string;
}

export function useRealtimeOrders(storeId?: string) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setupOrders = async () => {
      if (!storeId) {
        setOrders([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });

      if (!error) {
        setOrders((data as Order[]) ?? []);
      }

      setLoading(false);

      channel = supabase
        .channel(`orders-realtime-${storeId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders" },
          (payload) => {
            if (payload.eventType === "DELETE") {
              const deletedOrder = payload.old as Order;
              if (deletedOrder?.store_id === storeId) {
                setOrders((prev) => prev.filter((o) => o.id !== deletedOrder.id));
              }
              return;
            }

            const orderData = payload.new as Order;
            if (orderData?.store_id !== storeId) {
              return;
            }

            handleRealtimeEvent(payload);
          }
        )
        .subscribe();
    };

    const handleRealtimeEvent = (payload: { eventType: string; new: unknown }) => {
      if (payload.eventType === "INSERT") {
        setOrders((prev) => [payload.new as Order, ...prev]);
      } else if (payload.eventType === "UPDATE") {
        setOrders((prev) =>
          prev.map((o) => o.id === (payload.new as Order).id ? (payload.new as Order) : o)
        );
      }
    };

    setupOrders();
    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [storeId]);

  const removeOrder = (orderId: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
  };

  return { orders, loading, removeOrder };
}

export async function updateOrderStatus(orderId: string, status: string) {
  const { error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", orderId);
  if (error) throw error;
}

export async function deleteOrder(orderId: string) {
  const { error } = await supabase
    .from("orders")
    .delete()
    .eq("id", orderId);
  if (error) throw error;
}
