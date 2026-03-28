import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Store {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logo_url?: string;
  phone?: string;
  email?: string;
  address?: string;
  active: boolean;
  created_at: string;
}

export function useStores() {
  return useQuery({
    queryKey: ["stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Store[];
    },
  });
}

export function useCreateStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (store: Omit<Store, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase.from("stores").insert(store).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
    },
  });
}

export function useUpdateStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Store> & { id: string }) => {
      const { data, error } = await supabase
        .from("stores")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
    },
  });
}

export function useDeleteStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("stores").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
    },
  });
}
