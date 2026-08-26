import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./loadEnv.mjs";

const { url, key } = getSupabaseEnv();
const supabase = createClient(url, key);

async function checkTableStructure() {
  const { data, error } = await supabase.from("orders").select("*").limit(1);
  if (error) {
    console.error("Error fetching orders:", error);
  } else {
    console.log("Order Columns:", Object.keys(data[0] || {}));
  }
}

checkTableStructure();
