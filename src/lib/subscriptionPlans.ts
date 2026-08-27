export const PLAN_CODES = ["basic", "pro", "enterprise"] as const;

export type PlanCode = (typeof PLAN_CODES)[number];

export const PLAN_LABELS: Record<PlanCode, string> = {
  basic: "Basic",
  pro: "Pro",
  enterprise: "Enterprise",
};

export interface SubscriptionPlan {
  code: PlanCode;
  name: string;
  price: number;
  currency: "BRL";
  billingPeriod: "monthly";
  maxUsers: number;
  isActive: boolean;
}

export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    code: "basic",
    name: "Basic",
    price: 49.9,
    currency: "BRL",
    billingPeriod: "monthly",
    maxUsers: 2,
    isActive: true,
  },
  {
    code: "pro",
    name: "Pro",
    price: 99.9,
    currency: "BRL",
    billingPeriod: "monthly",
    maxUsers: 5,
    isActive: true,
  },
  {
    code: "enterprise",
    name: "Enterprise",
    price: 199.9,
    currency: "BRL",
    billingPeriod: "monthly",
    maxUsers: 15,
    isActive: true,
  },
];

export function isPlanCode(value: string): value is PlanCode {
  return (PLAN_CODES as readonly string[]).includes(value);
}

export function planLabel(code: string): string {
  return isPlanCode(code) ? PLAN_LABELS[code] : code;
}

export function formatPlanPrice(price: number, currency: string = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(price);
}

export function userLimitReachedMessage(planCode: string): string {
  const label = planLabel(planCode).toUpperCase();
  return `Limite de usuários do plano ${label} atingido. Faça upgrade do plano para adicionar mais usuários.`;
}
