import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, requireRemoteWritesAllowed } from "./loadEnv.mjs";

requireRemoteWritesAllowed();
const { url, key } = getSupabaseEnv();
const supabase = createClient(url, key);

async function run() {
  const storeName = "Loja Teste";
  const slug = "horti-delivery-lite-teste";

  try {
    const { data, error } = await supabase.from("stores").insert({
      owner_id: null,
      name: storeName,
      slug: slug,
    }).select();

    if (error) {
      console.log("INSERT ERROR:", JSON.stringify(error, null, 2));
    } else {
      console.log("SUCCESS:", data);
    }
  } catch (e) {
    console.log("Exception:", e);
  }
}

run();
