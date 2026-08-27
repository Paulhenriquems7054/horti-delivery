export function isStorePubliclyBlocked(store: {
  subscription_status?: string | null;
  active?: boolean | null;
} | null | undefined): boolean {
  if (!store) return false;
  return store.subscription_status === "blocked" || store.active === false;
}
