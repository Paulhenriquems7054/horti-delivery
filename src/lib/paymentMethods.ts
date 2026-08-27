export type CheckoutPayment = "cash" | "card" | "pix";

export const PAYMENT_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  credit: "Cartão",
  debit: "Cartão",
  card: "Cartão",
  pix: "PIX",
};

export function toStoredPaymentMethod(method: CheckoutPayment): "cash" | "credit" | "pix" {
  if (method === "card") return "credit";
  return method;
}

export function paymentLabel(method?: string | null): string {
  if (!method) return "—";
  return PAYMENT_LABELS[method] ?? method;
}
