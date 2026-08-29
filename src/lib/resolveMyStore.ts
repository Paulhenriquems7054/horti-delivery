import { supabase } from "@/integrations/supabase/client";
import type { Store } from "@/hooks/useStores";

function isMissingRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST202") return true;
  const msg = error.message?.toLowerCase() ?? "";
  return msg.includes("404") || msg.includes("could not find the function");
}

async function fetchMyStoreFallback(): Promise<Store | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: direct, error: directError } = await supabase
    .from("stores")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (directError) throw directError;
  if (direct) return direct as Store;

  const { data: membership, error: memberError } = await supabase
    .from("store_members")
    .select("store_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (memberError) {
    // Tabela ainda não migrada — só dono principal
    return null;
  }
  if (!membership?.store_id) return null;

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("*")
    .eq("id", membership.store_id)
    .single();
  if (storeError) throw storeError;
  return store as Store;
}

export async function fetchMyStore(): Promise<Store | null> {
  const { data, error } = await supabase.rpc("get_my_store" as never);

  if (!error && data && typeof data === "object") {
    return data as Store;
  }

  if (error && !isMissingRpc(error)) {
    throw error;
  }

  return fetchMyStoreFallback();
}

export async function fetchMyStoreId(): Promise<string | null> {
  const store = await fetchMyStore();
  return store?.id ?? null;
}
