/**
 * Lê credenciais somente de variáveis de ambiente.
 * Sem fallback para chaves hardcoded.
 */
export function requireEnv(name, aliases = []) {
  const names = [name, ...aliases];
  for (const key of names) {
    const value = process.env[key];
    if (value && value.trim()) return value.trim();
  }
  console.error(`Missing ${name}`);
  process.exit(1);
}

export function requireRemoteWritesAllowed() {
  if (process.env.ALLOW_REMOTE_TESTS !== "true") {
    console.error(
      "Refusing to run a write script against the remote database.\n" +
        "Set ALLOW_REMOTE_TESTS=true explicitly if you intend to proceed.",
    );
    process.exit(1);
  }
}

export function getSupabaseEnv() {
  return {
    url: requireEnv("SUPABASE_URL", ["VITE_SUPABASE_URL"]),
    key: requireEnv("SUPABASE_PUBLISHABLE_KEY", [
      "VITE_SUPABASE_PUBLISHABLE_KEY",
    ]),
  };
}
