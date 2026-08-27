import { describe, expect, it } from "vitest";
import {
  canConvertTrial,
  canRenewPaid,
  canUnblockToActive,
  displayPaidStart,
  isExpiryInTheFuture,
  planChangeTouchesPaidDates,
  renewalPreservesStartedAt,
  residualExpiryDoesNotConvertTrial,
  shouldAutoBlockPaid,
  shouldKeepTrialAfterPlanChange,
  trialPastDueDoesNotBecomeActive,
} from "./subscriptionLifecycle";

const now = new Date("2026-08-27T15:00:00.000Z");

describe("ciclo de vida da assinatura", () => {
  it("TESTE 1: trial + troca Basic → Pro permanece trial sem started_at", () => {
    const before = {
      subscription_status: "trial",
      subscription_plan: "basic",
      subscription_started_at: null,
      subscription_expires_at: null,
    };
    expect(shouldKeepTrialAfterPlanChange(before.subscription_status)).toBe(true);
    expect(planChangeTouchesPaidDates()).toBe(false);
    const after = { ...before, subscription_plan: "pro" };
    expect(after.subscription_status).toBe("trial");
    expect(after.subscription_started_at).toBeNull();
  });

  it("TESTE 2: conversão explícita exige expiração futura", () => {
    const store = {
      subscription_status: "trial",
      subscription_plan: "basic",
      subscription_started_at: null,
      subscription_expires_at: null,
    };
    expect(canConvertTrial(store)).toBe(true);
    expect(isExpiryInTheFuture("2026-09-30T00:00:00.000Z", now)).toBe(true);
    expect(isExpiryInTheFuture("2026-08-01T00:00:00.000Z", now)).toBe(false);
  });

  it("TESTE 3: trial + expires residual NÃO vira active", () => {
    const store = {
      subscription_status: "trial",
      subscription_plan: "basic",
      subscription_started_at: null,
      subscription_expires_at: "2026-07-25T00:00:00.000Z",
    };
    expect(residualExpiryDoesNotConvertTrial(store)).toBe(true);
    expect(shouldAutoBlockPaid(store, now)).toBe(false);
  });

  it("TESTE 4: active com expiração futura permanece active", () => {
    const store = {
      subscription_status: "active",
      subscription_plan: "pro",
      subscription_started_at: "2026-08-27T12:00:00.000Z",
      subscription_expires_at: "2026-09-30T00:00:00.000Z",
    };
    expect(shouldAutoBlockPaid(store, now)).toBe(false);
    expect(canRenewPaid(store)).toBe(true);
  });

  it("TESTE 5: active vencida deve ser bloqueada pelo job", () => {
    const store = {
      subscription_status: "active",
      subscription_plan: "pro",
      subscription_started_at: "2026-07-01T00:00:00.000Z",
      subscription_expires_at: "2026-08-01T00:00:00.000Z",
    };
    expect(shouldAutoBlockPaid(store, now)).toBe(true);
  });

  it("TESTE 6: blocked não é reprocessado pelo job", () => {
    const store = {
      subscription_status: "blocked",
      subscription_plan: "pro",
      subscription_started_at: "2026-07-01T00:00:00.000Z",
      subscription_expires_at: "2026-08-01T00:00:00.000Z",
      blocked_at: "2026-08-27T12:00:00.000Z",
    };
    expect(shouldAutoBlockPaid(store, now)).toBe(false);
  });

  it("TESTE 7: cancelled não é bloqueado pelo job", () => {
    const store = {
      subscription_status: "cancelled",
      subscription_plan: "pro",
      subscription_expires_at: "2026-08-01T00:00:00.000Z",
    };
    expect(shouldAutoBlockPaid(store, now)).toBe(false);
  });

  it("TESTE 8: trial vencido NÃO vira active", () => {
    const store = {
      subscription_status: "trial",
      subscription_plan: "basic",
      trial_ends_at: "2026-08-01T00:00:00.000Z",
      subscription_started_at: null,
    };
    expect(trialPastDueDoesNotBecomeActive(store, now)).toBe(true);
    expect(shouldAutoBlockPaid(store, now)).toBe(false);
  });

  it("TESTE 9: renovação preserva started_at", () => {
    const started = "2026-08-01T12:00:00.000Z";
    expect(renewalPreservesStartedAt(started, started)).toBe(true);
    expect(canRenewPaid({
      subscription_status: "active",
      subscription_plan: "pro",
      subscription_started_at: started,
    })).toBe(true);
  });

  it("desbloqueio recusa assinatura paga vencida", () => {
    expect(canUnblockToActive({
      subscription_status: "blocked",
      subscription_plan: "pro",
      subscription_started_at: "2026-07-01T00:00:00.000Z",
      subscription_expires_at: "2026-08-01T00:00:00.000Z",
    }, now)).toBe(false);
  });

  it("trial não exibe início de assinatura paga", () => {
    expect(displayPaidStart({
      subscription_status: "trial",
      subscription_plan: "pro",
      subscription_started_at: null,
      subscription_expires_at: "2026-07-25T00:00:00.000Z",
    })).toBeNull();
  });
});
