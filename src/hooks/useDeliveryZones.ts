import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DeliveryZone {
  id: string;
  store_id: string;
  name: string;
  neighborhood?: string; // legacy alias
  fee: number;
  min_order: number;
  active: boolean;
  created_at: string;
}

export function useDeliveryZones(storeId?: string) {
  return useQuery({
    queryKey: ["delivery-zones", storeId],
    queryFn: async () => {
      let query = supabase
        .from("delivery_zones")
        .select("*")
        .eq("active", true)
        .order("name");

      // filter by store only when storeId is provided
      if (storeId) {
        query = query.eq("store_id", storeId) as any;
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as DeliveryZone[];
    },
  });
}

export function useManageDeliveryZone() {
  const queryClient = useQueryClient();

  const addZone = useMutation({
    mutationFn: async (zone: { neighborhood?: string; name?: string; fee: number; store_id?: string; min_order?: number }) => {
      const payload: any = {
        fee: zone.fee,
        min_order: zone.min_order ?? 0,
        active: true,
      };

      // support both 'neighborhood' (legacy) and 'name' fields
      payload.name = zone.name ?? zone.neighborhood ?? "";

      if (zone.store_id) {
        payload.store_id = zone.store_id;
      } else {
        // fallback: link to first store
        const { data: store } = await supabase.from("stores").select("id").limit(1).maybeSingle();
        if (store) payload.store_id = store.id;
      }

      const { error } = await supabase.from("delivery_zones").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["delivery-zones"] }),
  });

  const deleteZone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("delivery_zones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["delivery-zones"] }),
  });

  // unified action mutation (used by AdminDeliveryZones page)
  const action = useMutation({
    mutationFn: async (params: { action: "create" | "update" | "delete"; id?: string; [key: string]: any }) => {
      const { action: act, id, ...data } = params;
      if (act === "create") {
        const { error } = await supabase.from("delivery_zones").insert(data);
        if (error) throw error;
      } else if (act === "update" && id) {
        const { error } = await supabase.from("delivery_zones").update(data).eq("id", id);
        if (error) throw error;
      } else if (act === "delete" && id) {
        const { error } = await supabase.from("delivery_zones").delete().eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["delivery-zones"] }),
  });

  return { addZone, deleteZone, mutate: action.mutate, mutateAsync: action.mutateAsync, isPending: action.isPending };
}
