import { describe, expect, it } from "vitest";
import { formatOrderReceiptText } from "@/lib/printReceipt";

describe("printReceipt", () => {
  it("inclui observação por item no comprovante", () => {
    const text = formatOrderReceiptText({
      store_name: "BEIRA RIO HORTIFRUTI",
      order_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      created_at: "2026-08-28T12:00:00.000Z",
      customer_name: "Maria",
      phone: "79999999999",
      address: "Rua A, 1",
      payment_method: "cash",
      notes: "Troco para 50",
      total: 25.5,
      items: [
        {
          product_name: "Banana",
          sold_by: "weight",
          quantity: 1,
          weight_kg: 2,
          price: 10,
          item_notes: "Banana madura",
        },
      ],
    });

    expect(text).toContain("BEIRA RIO");
    expect(text).toContain("Banana madura");
    expect(text).toContain("Troco para 50");
  });
});
