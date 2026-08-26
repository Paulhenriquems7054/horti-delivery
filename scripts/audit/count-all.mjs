import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./loadEnv.mjs";

const { url, key } = getSupabaseEnv();
const supabase = createClient(url, key);

async function countAll() {
  const { count: oCount, error: oErr } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true });
  const { count: iCount, error: iErr } = await supabase
    .from("order_items")
    .select("*", { count: "exact", head: true });

  console.log("Orders count:", oCount);
  console.log("Order Items count:", iCount);
  if (oErr) console.error("Orders Error:", oErr);
  if (iErr) console.error("Items Error:", iErr);
}

countAll();
