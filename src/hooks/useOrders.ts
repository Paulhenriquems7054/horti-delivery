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
    let channel: any = null;

    const setupOrders = async () => {
      if (!storeId) {
        console.log('❌ [useRealtimeOrders] No tenant store id available');
        setOrders([]);
        setLoading(false);
        return;
      }

      console.log('✅ [useRealtimeOrders] Using tenant store:', storeId);

      // Busca pedidos apenas dessa loja
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });

      console.log('📦 [useRealtimeOrders] Orders query result:', { 
        count: data?.length || 0, 
        error,
        storeId 
      });

      if (!error) {
        setOrders((data as Order[]) ?? []);
        console.log('✅ [useRealtimeOrders] Orders loaded:', data?.length || 0);
      } else {
        console.error('❌ [useRealtimeOrders] Error loading orders:', error);
      }
      
      setLoading(false);

      // Realtime filtrado por loja
      console.log('🔄 [useRealtimeOrders] Setting up realtime for store:', storeId);
      channel = supabase
        .channel(`orders-realtime-${storeId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders", filter: `store_id=eq.${storeId}` },
          (payload) => { 
            console.log('🔔 [useRealtimeOrders] Realtime event:', payload.eventType, payload);
            handleRealtimeEvent(payload); 
          }
        )
        .subscribe((status) => {
          console.log('📡 [useRealtimeOrders] Realtime status:', status);
        });
    };

    const handleRealtimeEvent = (payload: any) => {
      if (payload.eventType === "INSERT") {
        console.log('➕ [useRealtimeOrders] New order inserted:', payload.new);
        setOrders((prev) => [payload.new as Order, ...prev]);
      } else if (payload.eventType === "UPDATE") {
        console.log('🔄 [useRealtimeOrders] Order updated:', payload.new);
        setOrders((prev) =>
          prev.map((o) => o.id === (payload.new as Order).id ? (payload.new as Order) : o)
        );
      } else if (payload.eventType === "DELETE") {
        console.log('🗑️ [useRealtimeOrders] Order deleted:', payload.old);
        setOrders((prev) => prev.filter((o) => o.id !== (payload.old as Order).id));
      }
    };

    setupOrders();
    return () => { 
      if (channel) {
        console.log('🔌 [useRealtimeOrders] Unsubscribing from realtime');
        supabase.removeChannel(channel); 
      }
    };
  }, [storeId]);

  return { orders, loading };
}

export async function updateOrderStatus(orderId: string, status: string) {
  const { error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", orderId);
  if (error) throw error;
}

export async function deleteOrder(orderId: string) {
  // order_items serão deletados automaticamente por CASCADE
  const { error } = await supabase
    .from("orders")
    .delete()
    .eq("id", orderId);
  if (error) throw error;
}
