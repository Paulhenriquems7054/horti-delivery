import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./loadEnv.mjs";

const { url, key } = getSupabaseEnv();
const supabase = createClient(url, key);

async function checkStoreIdColumn() {
  const { data, error } = await supabase.from("orders").select("store_id").limit(1);
  if (error) {
    console.log("CONFIRMADO: O erro ao buscar store_id é:", error.message);
  } else {
    console.log("A coluna store_id EXISTE no banco.");
  }
}

checkStoreIdColumn();
