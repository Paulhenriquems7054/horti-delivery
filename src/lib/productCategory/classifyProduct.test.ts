import { describe, expect, it } from "vitest";
import {
  CATALOG_CATEGORY_NAMES,
  CATALOG_CATEGORY_SEEDS,
  classifyProductName,
} from "@/lib/productCategory/classifyProduct";

describe("catalog category seeds", () => {
  it("define exatamente 9 categorias distintas", () => {
    expect(CATALOG_CATEGORY_NAMES).toHaveLength(9);
    expect(CATALOG_CATEGORY_SEEDS).toHaveLength(9);
    expect(CATALOG_CATEGORY_NAMES).toContain("Utilidades e Outros");
    expect(CATALOG_CATEGORY_NAMES).toContain("Produtos Descartáveis");
    expect(CATALOG_CATEGORY_NAMES).not.toContain("Utilidades e Outros: Produtos descartáveis");
  });
});

describe("classifyProductName", () => {
  it("classifica hortifrúti", () => {
    const r = classifyProductName("BANANA NANICA");
    expect(r.status).toBe("CLASSIFIED");
    expect(r.categoryName).toBe("Hortifrúti");
  });

  it("classifica frios/laticínios", () => {
    const r = classifyProductName("GREGO DANONE ORIGINAL 85G");
    expect(r.status).toBe("CLASSIFIED");
    expect(r.categoryName).toBe("Frios e Laticínios");
  });

  it("classifica mercearia (chia)", () => {
    const r = classifyProductName("CHIA TIA SONIA 100G");
    expect(r.status).toBe("CLASSIFIED");
    expect(r.categoryName).toBe("Mercearia Seca e Básica");
  });

  it("classifica higiene e preserva # no fluxo de nome original", () => {
    const r = classifyProductName("#AGUA COL.POM POM 100ML");
    expect(r.status).toBe("CLASSIFIED");
    expect(r.categoryName).toBe("Higiene Pessoal");
  });

  it("classifica hidratante como higiene", () => {
    const r = classifyProductName("HIDRATANTE PAIXAO FELICIDADE 200ML");
    expect(r.status).toBe("CLASSIFIED");
    expect(r.categoryName).toBe("Higiene Pessoal");
  });

  it("classifica limpeza (água sanitária ≠ bebida)", () => {
    const r = classifyProductName("AGUA SANITARIA 1L");
    expect(r.status).toBe("CLASSIFIED");
    expect(r.categoryName).toBe("Limpeza");
  });

  it("classifica bebidas", () => {
    const r = classifyProductName("AGUA MINERAL CRISTAL 500ML");
    expect(r.status).toBe("CLASSIFIED");
    expect(r.categoryName).toBe("Bebidas");
  });

  it("classifica descartáveis", () => {
    const r = classifyProductName("SACO BD 53X80X10 LISO SANFONA LATERAL");
    expect(r.status).toBe("CLASSIFIED");
    expect(r.categoryName).toBe("Produtos Descartáveis");
  });

  it("marca produto sem regra como UNCLASSIFIED", () => {
    const r = classifyProductName("XYZ ESPECIAL MODELO QWERT");
    expect(r.status).toBe("UNCLASSIFIED");
    expect(r.categoryName).toBeNull();
  });

  it("não inventa categoria para nome vazio", () => {
    const r = classifyProductName("   ");
    expect(r.status).toBe("UNCLASSIFIED");
  });
});
