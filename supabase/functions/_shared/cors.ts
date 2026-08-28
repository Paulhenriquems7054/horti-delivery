export function buildCorsHeaders(request: Request): Record<string, string> {
  const allowedRaw = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  const allowed = allowedRaw.split(",").map((o) => o.trim()).filter(Boolean);
  const origin = request.headers.get("Origin");
  let allowOrigin = allowed[0] ?? "*";

  if (origin && allowed.length > 0 && allowed.includes(origin)) {
    allowOrigin = origin;
  } else if (allowed.length === 0 && origin) {
    allowOrigin = origin;
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-cron-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
