import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, requireRemoteWritesAllowed } from "./loadEnv.mjs";

requireRemoteWritesAllowed();
const { url, key } = getSupabaseEnv();
const supabase = createClient(url, key);

async function testInsert() {
  console.log("Trying to insert order...");
  const { data, error } = await supabase
    .from("orders")
    .insert({
      customer_name: "Test Runner",
      phone: "00000000000",
      address: "Test Address",
      total: 10.5,
      status: "pending",
    })
    .select();

  if (error) {
    console.error("Order Insert Error:", error);
  } else {
    console.log("Order Insert Success:", JSON.stringify(data, null, 2));
  }
}

testInsert();
