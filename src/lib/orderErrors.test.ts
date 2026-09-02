import { describe, expect, it } from "vitest";
import { mapOrderErrorMessage } from "@/lib/orderErrors";

describe("mapOrderErrorMessage", () => {
  it("traduz erros conhecidos do RPC", () => {
    expect(mapOrderErrorMessage("invalid delivery zone")).toContain("Bairro");
    expect(mapOrderErrorMessage("active order exists")).toContain("pedido em andamento");
    expect(mapOrderErrorMessage("minimum order not met")).toContain("mínimo");
  });

  it("repassa mensagem desconhecida", () => {
    expect(mapOrderErrorMessage("erro customizado")).toBe("erro customizado");
  });
});
