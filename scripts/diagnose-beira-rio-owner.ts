import * as fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(p: string) {
  const o: Record<string, string> = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    let k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    o[k] = v;
  }
  return o;
}

const env = loadEnv(".env");
const sb = createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { persistSession: false },
});

const { data: auth, error: ae } = await sb.auth.signInWithPassword({
  email: env.BEIRA_RIO_OWNER_EMAIL!,
  password: env.BEIRA_RIO_OWNER_PASSWORD!,
});
if (ae) throw ae;
console.log(JSON.stringify({ uid: auth.user!.id, email: auth.user!.email }, null, 2));

const { data: sid, error: e1 } = await sb.rpc("get_my_store_id");
console.log("get_my_store_id", sid, e1?.message ?? null);

const { data: mystore, error: e0 } = await sb.rpc("get_my_store");
console.log("get_my_store", mystore, e0?.message ?? null);

const { data: sm, error: e2 } = await sb
  .from("store_members")
  .select("*")
  .eq("user_id", auth.user!.id);
console.log("store_members", sm, e2?.message ?? null);

const { data: st, error: e3 } = await sb
  .from("stores")
  .select("id,slug,user_id,name")
  .eq("user_id", auth.user!.id);
console.log("stores_as_primary", st, e3?.message ?? null);

await sb.auth.signOut();
