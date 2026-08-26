import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string, aliases: string[] = []): string {
  for (const key of [name, ...aliases]) {
    const value = process.env[key];
    if (value && value.trim()) return value.trim();
  }
  throw new Error(`Missing ${name}`);
}

function requireRemoteWritesAllowed() {
  if (process.env.ALLOW_REMOTE_TESTS !== "true") {
    throw new Error(
      "Refusing to run a write script against the remote database. Set ALLOW_REMOTE_TESTS=true explicitly if you intend to proceed.",
    );
  }
}

async function run() {
  requireRemoteWritesAllowed();
  const supabase = createClient(
    requireEnv("SUPABASE_URL", ["VITE_SUPABASE_URL"]),
    requireEnv("SUPABASE_PUBLISHABLE_KEY", ["VITE_SUPABASE_PUBLISHABLE_KEY"]),
  );

  const email = `test-${Date.now()}@example.com`;
  const password = process.env.TEST_SIGNUP_PASSWORD;
  if (!password) {
    throw new Error("Missing TEST_SIGNUP_PASSWORD");
  }
  const slug = `slug-${Date.now()}`;
  const storeName = `Store ${Date.now()}`;

  console.log("Signing up...", email);
  const { data: { user }, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (signUpError) {
    console.error("SignUp Error:", signUpError);
    return;
  }

  const { data, error: storeError } = await supabase.from("stores").insert({
    owner_id: user?.id,
    name: storeName,
    slug: slug,
  }).select();

  if (storeError) {
    console.error("Store Error:", storeError);
  } else {
    console.log("Store Created:", data);
  }
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
