import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ggtdnczmmoxagmbzopsf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdndGRuY3ptbW94YWdtYnpvcHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMzgxMTIsImV4cCI6MjA4OTcxNDExMn0.oqrMVrztvsLXtdaZoB6hdxB_IWsaWhjf4IZUbS_nQR0";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function countAll() {
  const { count: oCount, error: oErr } = await supabase.from("orders").select("*", { count: 'exact', head: true });
  const { count: iCount, error: iErr } = await supabase.from("order_items").select("*", { count: 'exact', head: true });
  
  console.log("Orders count:", oCount);
  console.log("Order Items count:", iCount);
  if (oErr) console.error("Orders Error:", oErr);
  if (iErr) console.error("Items Error:", iErr);
}

countAll();
