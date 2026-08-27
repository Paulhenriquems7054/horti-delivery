import { describe, expect, it } from "vitest";
import { paymentLabel, toStoredPaymentMethod } from "./paymentMethods";

describe("pagamento na entrega", () => {
  it("PIX é forma de pagamento presencial", () => {
    expect(toStoredPaymentMethod("pix")).toBe("pix");
    expect(paymentLabel("pix")).toBe("PIX");
  });

  it("cartão é gravado como credit (compatível com o banco)", () => {
    expect(toStoredPaymentMethod("card")).toBe("credit");
    expect(paymentLabel("credit")).toBe("Cartão");
  });

  it("dinheiro permanece cash", () => {
    expect(toStoredPaymentMethod("cash")).toBe("cash");
    expect(paymentLabel("cash")).toBe("Dinheiro");
  });
});
