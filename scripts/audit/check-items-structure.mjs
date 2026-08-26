import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./loadEnv.mjs";

const { url, key } = getSupabaseEnv();
const supabase = createClient(url, key);

async function checkOrderItemsStructure() {
  const { data, error } = await supabase.from("order_items").select("*").limit(1);
  if (error) {
    console.error("Error fetching order_items:", error);
  } else {
    console.log("Order Items Columns:", Object.keys(data[0] || {}));
  }
}

checkOrderItemsStructure();
