import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./loadEnv.mjs";

const { url, key } = getSupabaseEnv();
const supabase = createClient(url, key);

function pass(name) {
  console.log(`PASS  ${name}`);
}
function fail(name, extra) {
  console.log(`FAIL  ${name}${extra ? ` — ${extra}` : ""}`);
}

async function main() {
  // Anon must not read private orders
  const { data: orders, error: ordersErr } = await supabase.from("orders").select("id").limit(5);
  if (ordersErr || !orders || orders.length === 0) pass("anon cannot list orders");
  else fail("anon listed orders", `count=${orders.length}`);

  // Anon must not read delivery_pin
  const { data: stores } = await supabase.from("stores").select("id, delivery_pin").limit(1);
  if (stores && stores.length && stores[0].delivery_pin) fail("anon read delivery_pin");
  else pass("anon cannot read delivery_pin from stores");

  const { data: pub } = await supabase.from("stores_public").select("id, slug").limit(1);
  if (pub && pub.length) pass("anon can read stores_public");
  else fail("anon cannot read stores_public", "migration may be unapplied");

  // Direct insert is not executed here (would be destructive if RLS is still open).
  console.log("SKIP  anon insert orders — not executed against hosted data");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
