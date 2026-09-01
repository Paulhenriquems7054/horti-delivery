import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { StoreInfo } from "@/hooks/useStoreInfo";

const STORE_SELECT =
  "id, name, slug, description, logo_url, logo_path, phone, active, subscription_status, updated_at";

async function fetchLandingStore(): Promise<StoreInfo | null> {
  const preferredSlug = import.meta.env.VITE_DEFAULT_STORE_SLUG?.trim();

  if (preferredSlug) {
    const { data, error } = await supabase
      .from("stores_public")
      .select(STORE_SELECT)
      .eq("slug", preferredSlug)
      .eq("active", true)
      .neq("subscription_status", "blocked")
      .maybeSingle();

    if (error) throw error;
    if (data) return data as StoreInfo;
  }

  const { data, error } = await supabase
    .from("stores_public")
    .select(STORE_SELECT)
    .eq("active", true)
    .neq("subscription_status", "blocked")
    .order("name")
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as StoreInfo | null) ?? null;
}

export function useLandingStore() {
  return useQuery({
    queryKey: ["landing-store", import.meta.env.VITE_DEFAULT_STORE_SLUG ?? "first-active"],
    queryFn: fetchLandingStore,
    staleTime: 60_000,
  });
}

export function shouldRedirectLandingToStore(): boolean {
  return import.meta.env.VITE_LANDING_REDIRECT_TO_STORE === "true";
}
