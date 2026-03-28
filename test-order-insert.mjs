import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ggtdnczmmoxagmbzopsf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdndGRuY3ptbW94YWdtYnpvcHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMzgxMTIsImV4cCI6MjA4OTcxNDExMn0.oqrMVrztvsLXtdaZoB6hdxB_IWsaWhjf4IZUbS_nQR0";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function testInsert() {
  console.log("Trying to insert order...");
  const { data, error } = await supabase
    .from("orders")
    .insert({
      customer_name: "Test Runner",
      phone: "123456789",
      address: "Test Address",
      total: 10.5,
      status: "pending"
    })
    .select();

  if (error) {
    console.error("Order Insert Error:", error);
  } else {
    console.log("Order Insert Success:", JSON.stringify(data, null, 2));
  }
}

testInsert();
