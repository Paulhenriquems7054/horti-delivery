/**
 * Slugs reservados que NÃO devem ser usados como slug de loja.
 * As rotas específicas em App.tsx têm prioridade sobre `/:slug`.
 */
export const RESERVED_STORE_SLUGS = [
  "admin",
  "login",
  "track",
  "delivery",
  "delivery-tracking",
  "superadmin",
  "acesso-negado",
  "reset-password",
  "api",
  "auth",
] as const;

export function isReservedStoreSlug(slug: string): boolean {
  return (RESERVED_STORE_SLUGS as readonly string[]).includes(slug.toLowerCase());
}
