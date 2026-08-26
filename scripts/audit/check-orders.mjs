import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./loadEnv.mjs";

const { url, key } = getSupabaseEnv();
const supabase = createClient(url, key);

async function checkStoresAndLastOrders() {
  const { data: stores } = await supabase.from("stores").select("id, slug, name");
  console.log("Existing Stores:", stores);

  if (stores && stores.length > 0) {
    const { data: orders } = await supabase
      .from("orders")
      .select("id, status, created_at, store_id")
      .eq("store_id", stores[0].id)
      .order("created_at", { ascending: false });
    console.log(`Last orders for ${stores[0].slug}:`, orders);
  }
}

checkStoresAndLastOrders();
