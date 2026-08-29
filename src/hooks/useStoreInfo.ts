import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface StoreInfo {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logo_url?: string;
  logo_path?: string | null;
  phone?: string;
  active: boolean;
  subscription_status: string;
  blocked_reason?: string;
}

export function useStoreInfo(slug: string | undefined) {
  return useQuery({
    queryKey: ["store-info", slug],
    queryFn: async () => {
      if (!slug) throw new Error("Slug não fornecido");

      const { data, error } = await (supabase as any)
        .from("stores_public")
        .select("id, name, slug, description, logo_url, logo_path, phone, active, subscription_status")
        .eq("slug", slug)
        .maybeSingle();

      if (error) throw error;
      return data as StoreInfo | null;
    },
    enabled: !!slug,
    staleTime: 0,
    refetchOnMount: "always",
  });
}
