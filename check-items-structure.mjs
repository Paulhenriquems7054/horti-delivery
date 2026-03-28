import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ggtdnczmmoxagmbzopsf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdndGRuY3ptbW94YWdtYnpvcHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMzgxMTIsImV4cCI6MjA4OTcxNDExMn0.oqrMVrztvsLXtdaZoB6hdxB_IWsaWhjf4IZUbS_nQR0";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function checkOrderItemsStructure() {
  const { data, error } = await supabase.from("order_items").select("*").limit(1);
  if (error) {
    console.error("Error fetching order_items:", error);
  } else {
    console.log("Order Items Columns:", Object.keys(data[0] || {}));
  }
}

checkOrderItemsStructure();
