import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OrderTracking {
  id: string;
  order_id: string;
  status: string;
  notes?: string;
  created_at: string;
}

export function useOrderTracking(orderId?: string) {
  return useQuery({
    queryKey: ["order-tracking", orderId],
    queryFn: async () => {
      if (!orderId) return [];
      const { data, error } = await supabase
        .from("order_tracking")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as OrderTracking[];
    },
    enabled: !!orderId,
  });
}

export function useAddOrderTracking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tracking: Omit<OrderTracking, "id" | "created_at">) => {
      const { data, error } = await supabase
        .from("order_tracking")
        .insert(tracking)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["order-tracking", data.order_id] });
    },
  });
}

// Hook to track order by phone
export function useCustomerOrders(phone?: string) {
  return useQuery({
    queryKey: ["customer-orders", phone],
    queryFn: async () => {
      if (!phone) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("phone", phone)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!phone,
  });
}
