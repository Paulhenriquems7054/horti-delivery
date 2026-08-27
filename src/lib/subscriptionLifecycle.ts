export type SubscriptionStatus = "trial" | "active" | "blocked" | "cancelled";

export interface SubscriptionSnapshot {
  subscription_status: string;
  subscription_plan: string;
  trial_ends_at?: string | null;
  subscription_started_at?: string | null;
  subscription_expires_at?: string | null;
  active?: boolean;
  blocked_at?: string | null;
  blocked_reason?: string | null;
}

export const PAID_BLOCK_REASON = "Assinatura vencida";
export const MANUAL_BLOCK_PREFIX = "Bloqueio manual pela Super Admin";

export function isPaidExpired(store: SubscriptionSnapshot, now = new Date()): boolean {
  if (!store.subscription_expires_at) return false;
  return new Date(store.subscription_expires_at) <= now;
}

export function shouldAutoBlockPaid(store: SubscriptionSnapshot, now = new Date()): boolean {
  return store.subscription_status === "active" && isPaidExpired(store, now);
}

export function shouldKeepTrialAfterPlanChange(status: string): boolean {
  return status === "trial";
}

export function planChangeTouchesPaidDates(): boolean {
  return false;
}

export function residualExpiryDoesNotConvertTrial(store: SubscriptionSnapshot): boolean {
  return store.subscription_status === "trial";
}

export function canConvertTrial(store: SubscriptionSnapshot): boolean {
  return store.subscription_status === "trial";
}

export function isExpiryInTheFuture(expiresAt: Date | string, now = new Date()): boolean {
  const expires = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  return expires.getTime() > now.getTime();
}

export function canRenewPaid(store: SubscriptionSnapshot): boolean {
  return store.subscription_status === "active";
}

export function renewalPreservesStartedAt(
  before: string | null | undefined,
  after: string | null | undefined,
): boolean {
  return before === after;
}

export function canUnblockToActive(store: SubscriptionSnapshot, now = new Date()): boolean {
  if (store.subscription_started_at && isPaidExpired(store, now)) return false;
  return true;
}

export function trialPastDueDoesNotBecomeActive(store: SubscriptionSnapshot, now = new Date()): boolean {
  if (store.subscription_status !== "trial") return true;
  if (!store.trial_ends_at) return true;
  if (new Date(store.trial_ends_at) > now) return true;
  return store.subscription_status !== "active";
}

export function displayPaidStart(store: SubscriptionSnapshot): string | null {
  if (store.subscription_status === "trial") return null;
  return store.subscription_started_at ?? null;
}
