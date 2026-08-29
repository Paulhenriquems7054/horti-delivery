import { supabase } from "@/integrations/supabase/client";
import type { Store } from "@/hooks/useStores";

export async function fetchMyStore(): Promise<Store | null> {
  const { data, error } = await supabase.rpc("get_my_store" as never);
  if (error) throw error;
  if (!data || typeof data !== "object") return null;
  return data as Store;
}

export async function fetchMyStoreId(): Promise<string | null> {
  const store = await fetchMyStore();
  return store?.id ?? null;
}
