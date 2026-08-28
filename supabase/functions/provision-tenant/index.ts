// Cria usuário Auth (Admin API) e chama provision_tenant_for_user.
// SERVICE_ROLE só neste runtime Deno — nunca no frontend / VITE_.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders } from "../_shared/cors.ts";

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405, cors);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "server misconfigured" }, 500, cors);
  }
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ error: "not authenticated" }, 401, cors);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: isAdmin, error: adminErr } = await userClient.rpc("is_platform_admin");
  if (adminErr || isAdmin !== true) {
    return json({ error: "not authorized" }, 403, cors);
  }

  let payload: {
    email?: string;
    password?: string;
    name?: string;
    slug?: string;
    phone?: string;
    plan?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid payload" }, 400, cors);
  }

  const email = (payload.email ?? "").trim().toLowerCase();
  const password = payload.password ?? "";
  const name = (payload.name ?? "").trim();
  const slug = (payload.slug ?? "").trim().toLowerCase();
  const phone = (payload.phone ?? "").trim() || null;
  const plan = payload.plan ?? "basic";

  if (!email || password.length < 8 || name.length < 2 || !slug) {
    return json({ error: "invalid payload" }, 400, cors);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let userId: string | null = null;
  let createdAuth = false;

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (created.error || !created.data.user) {
    const msg = (created.error?.message ?? "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return json({ error: "email already registered" }, 409, cors);
    }
    return json({ error: "could not create user" }, 400, cors);
  }

  userId = created.data.user.id;
  createdAuth = true;

  const { data: store, error: rpcErr } = await userClient.rpc("provision_tenant_for_user", {
    p_user_id: userId,
    p_name: name,
    p_slug: slug,
    p_email: email,
    p_phone: phone,
    p_plan: plan,
  });

  if (rpcErr) {
    if (createdAuth && userId) {
      await admin.auth.admin.deleteUser(userId);
    }
    const hint = (rpcErr.message ?? "").toLowerCase();
    if (hint.includes("slug")) return json({ error: "slug in use" }, 409, cors);
    if (hint.includes("not authorized")) return json({ error: "not authorized" }, 403, cors);
    return json({ error: "could not provision store" }, 400, cors);
  }

  return json({ store, user_id: userId }, 200, cors);
});
