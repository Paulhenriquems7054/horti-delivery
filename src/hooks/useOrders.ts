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

export function useRealtimeOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let channel: any = null;

    const setupOrders = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        setLoading(false);
        return;
      }

      // Busca a loja do usuário logado via user_id
      const { data: store } = await supabase
        .from("stores")
        .select("id")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (!store) {
        // Sem loja vinculada: carrega todos os pedidos (fallback para admin único)
        const { data, error } = await supabase
          .from("orders")
          .select("*")
          .order("created_at", { ascending: false });

        if (!error) setOrders((data as Order[]) ?? []);
        setLoading(false);

        channel = supabase
          .channel("orders-realtime-all")
          .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
            handleRealtimeEvent(payload);
          })
          .subscribe();
        return;
      }

      // Busca pedidos apenas dessa loja
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false });

      if (!error) setOrders((data as Order[]) ?? []);
      setLoading(false);

      // Realtime filtrado por loja
      channel = supabase
        .channel("orders-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders", filter: `store_id=eq.${store.id}` },
          (payload) => { handleRealtimeEvent(payload); }
        )
        .subscribe();
    };

    const handleRealtimeEvent = (payload: any) => {
      if (payload.eventType === "INSERT") {
        setOrders((prev) => [payload.new as Order, ...prev]);
      } else if (payload.eventType === "UPDATE") {
        setOrders((prev) =>
          prev.map((o) => o.id === (payload.new as Order).id ? (payload.new as Order) : o)
        );
      } else if (payload.eventType === "DELETE") {
        setOrders((prev) => prev.filter((o) => o.id !== (payload.old as Order).id));
      }
    };

    setupOrders();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, []);

  return { orders, loading };
}

export async function updateOrderStatus(orderId: string, status: string) {
  const { error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", orderId);
  if (error) throw error;
}
