import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ggtdnczmmoxagmbzopsf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdndGRuY3ptbW94YWdtYnpvcHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMzgxMTIsImV4cCI6MjA4OTcxNDExMn0.oqrMVrztvsLXtdaZoB6hdxB_IWsaWhjf4IZUbS_nQR0";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function checkStoresAndLastOrders() {
  const { data: stores } = await supabase.from("stores").select("id, slug, name");
  console.log("Existing Stores:", stores);

  if (stores && stores.length > 0) {
    const { data: orders } = await supabase.from("orders").select("*").eq("store_id", stores[0].id).order("created_at", { ascending: false });
    console.log(`Last orders for ${stores[0].slug}:`, orders);
  }
}

checkStoresAndLastOrders();
