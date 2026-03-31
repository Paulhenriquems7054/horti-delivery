import { useQuery, useMutation, useQueryClient, useEffect as _useEffect } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export interface DirectDelivery {
  id: string;
  store_id: string;
  customer_name: string;
  phone: string;
  address: string;
  total_purchase: number;
  delivery_fee?: number;
  status: "pending_fee" | "awaiting_approval" | "approved" | "delivering" | "delivered" | "cancelled";
  notes?: string;
  created_at: string;
  approved_at?: string;
  delivered_at?: string;
}

// Admin: lista entregas diretas da loja em realtime
export function useRealtimeDirectDeliveries(storeId?: string) {
  const [deliveries, setDeliveries] = useState<DirectDelivery[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) { setLoading(false); return; }

    (supabase as any)
      .from("direct_deliveries")
      .select("*")
      .eq("store_id", storeId)
      .not("status", "in", '("delivered","cancelled")')
      .order("created_at", { ascending: false })
      .then(({ data }: any) => {
        if (data) setDeliveries(data);
        setLoading(false);
      });

    const channel = (supabase as any)
      .channel("direct-deliveries-" + storeId)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "direct_deliveries",
        filter: `store_id=eq.${storeId}`,
      }, (payload: any) => {
        if (payload.eventType === "INSERT") {
          setDeliveries(p => [payload.new, ...p]);
        } else if (payload.eventType === "UPDATE") {
          setDeliveries(p => p.map(d => d.id === payload.new.id ? payload.new : d)
            .filter(d => !["delivered","cancelled"].includes(d.status)));
        }
      })
      .subscribe();

    return () => { (supabase as any).removeChannel(channel); };
  }, [storeId]);

  return { deliveries, loading };
}

// Cliente: acompanha sua entrega direta em realtime
export function useCustomerDirectDelivery(phone: string) {
  const [deliveries, setDeliveries] = useState<DirectDelivery[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!phone) return;
    setLoading(true);

    (supabase as any)
      .from("direct_deliveries")
      .select("*")
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }: any) => {
        if (data) setDeliveries(data);
        setLoading(false);
      });

    const channel = (supabase as any)
      .channel("customer-direct-" + phone)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "direct_deliveries",
        filter: `phone=eq.${phone}`,
      }, (payload: any) => {
        setDeliveries(p => p.map(d => d.id === payload.new.id ? payload.new : d));
      })
      .subscribe();

    return () => { (supabase as any).removeChannel(channel); };
  }, [phone]);

  return { deliveries, loading };
}

// Admin: criar entrega direta
export function useCreateDirectDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<DirectDelivery, "id" | "created_at" | "status">) => {
      const { data: result, error } = await (supabase as any)
        .from("direct_deliveries")
        .insert({ ...data, status: "pending_fee" })
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["direct-deliveries"] }),
  });
}

// Admin: definir taxa de entrega
export function useSetDeliveryFee() {
  return useMutation({
    mutationFn: async ({ id, fee }: { id: string; fee: number }) => {
      const { error } = await (supabase as any)
        .from("direct_deliveries")
        .update({ delivery_fee: fee, status: "awaiting_approval" })
        .eq("id", id);
      if (error) throw error;
    },
  });
}

// Admin: atualizar status
export function useUpdateDirectDeliveryStatus() {
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: DirectDelivery["status"] }) => {
      const updates: any = { status };
      if (status === "approved") updates.approved_at = new Date().toISOString();
      if (status === "delivered") updates.delivered_at = new Date().toISOString();
      const { error } = await (supabase as any)
        .from("direct_deliveries")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
  });
}

// Cliente: aprovar ou recusar taxa
export function useRespondToFee() {
  return useMutation({
    mutationFn: async ({ id, approved }: { id: string; approved: boolean }) => {
      const { error } = await (supabase as any)
        .from("direct_deliveries")
        .update({
          status: approved ? "approved" : "cancelled",
          ...(approved ? { approved_at: new Date().toISOString() } : {}),
        })
        .eq("id", id);
      if (error) throw error;
    },
  });
}
