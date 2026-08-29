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
  });
});

describe("classifyProductName L1", () => {
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

  it("classifica mercearia (chia e BISC)", () => {
    expect(classifyProductName("CHIA TIA SONIA 100G").categoryName).toBe("Mercearia Seca e Básica");
    expect(classifyProductName("BISC MARILAN CHOCOLATE 400G").categoryName).toBe(
      "Mercearia Seca e Básica",
    );
  });

  it("classifica higiene e preserva lógica de #", () => {
    expect(classifyProductName("#AGUA COL.POM POM 100ML").categoryName).toBe("Higiene Pessoal");
    expect(classifyProductName("HIDRATANTE PAIXAO FELICIDADE 200ML").categoryName).toBe(
      "Higiene Pessoal",
    );
    expect(classifyProductName("ESM COLORAMA VERMELHO 8ML").categoryName).toBe("Higiene Pessoal");
    expect(classifyProductName("DESOD REXONA CLINICAL").categoryName).toBe("Higiene Pessoal");
  });

  it("água sanitária ≠ bebida; água mineral = bebida", () => {
    expect(classifyProductName("AGUA SANITARIA 1L").categoryName).toBe("Limpeza");
    expect(classifyProductName("AGUA MINERAL CRISTAL 500ML").categoryName).toBe("Bebidas");
  });

  it("classifica sandálias como utilidades (padrão real SAND/HAV)", () => {
    expect(classifyProductName("SAND HAV SLIM PRETO 37/38").categoryName).toBe("Utilidades e Outros");
    expect(classifyProductName("SAND DUPE MONOCOLOR ROSA 35/36").categoryName).toBe(
      "Utilidades e Outros",
    );
  });

  it("classifica abreviações do catálogo Beira Rio", () => {
    expect(classifyProductName("DETERG YPE CLEAR 500ML").categoryName).toBe("Limpeza");
    expect(classifyProductName("KOLESTON 6.0 LOURO ESCURO").categoryName).toBe("Higiene Pessoal");
    expect(classifyProductName("AZEITONAS VERDES 200G").categoryName).toBe("Mercearia Seca e Básica");
    expect(classifyProductName("RUFFLES ORIGINAL 57G").categoryName).toBe("Mercearia Seca e Básica");
    expect(classifyProductName("FILME PVC 28CM 15M").categoryName).toBe("Produtos Descartáveis");
  });

  it("classifica descartáveis", () => {
    expect(classifyProductName("SACO BD 53X80X10 LISO SANFONA LATERAL").categoryName).toBe(
      "Produtos Descartáveis",
    );
  });

  it("leite condensado vai para mercearia, não só frios", () => {
    expect(classifyProductName("LEITE CONDENSADO MOCA 395G").categoryName).toBe(
      "Mercearia Seca e Básica",
    );
  });

  it("não inventa categoria para nome vazio", () => {
    expect(classifyProductName("   ").status).toBe("UNCLASSIFIED");
  });

  it("produto sem regra clara permanece não classificado ou revisão", () => {
    const r = classifyProductName("XYZ ESPECIAL MODELO QWERT");
    expect(["UNCLASSIFIED", "REVIEW_REQUIRED"]).toContain(r.status);
    expect(r.categoryName).toBeNull();
  });

  it("corrige falsos positivos da amostragem Beira Rio", () => {
    expect(classifyProductName("ACTIVIA DANREGULAR AMEIXA 850G").categoryName).toBe(
      "Frios e Laticínios",
    );
    expect(classifyProductName("0ANONINHO BANANA E MACA 510G").categoryName).toBe(
      "Frios e Laticínios",
    );
    expect(classifyProductName("AGUA MICELAR LOREAL P/LIMP.DE PELE 200ML").categoryName).toBe(
      "Higiene Pessoal",
    );
    expect(classifyProductName("AMAC.ROUPA SONHO AZUL PROFUNDO").categoryName).toBe("Limpeza");
    expect(classifyProductName("ACETONA LAYS 100ML").categoryName).toBe("Higiene Pessoal");
  });

  it("classifica padrões restantes seguros do catálogo", () => {
    expect(classifyProductName("PINO 3 SAIDAS T 10A").categoryName).toBe("Utilidades e Outros");
    expect(classifyProductName("CANUDOS FLEXIVEIS COLORIDOS").categoryName).toBe(
      "Produtos Descartáveis",
    );
    expect(classifyProductName("CHICLE TRIDENT MENTA").categoryName).toBe("Mercearia Seca e Básica");
    expect(classifyProductName("DES AER AXE BODY SPRAY BLACK 150ML").categoryName).toBe(
      "Higiene Pessoal",
    );
    expect(classifyProductName("PASTA C/ABA OFICIO FUME").categoryName).toBe("Utilidades e Outros");
    expect(classifyProductName("KIT 5.3 E ESM BEAUTY COLOR").categoryName).toBe("Higiene Pessoal");
  });
});

describe("classifyProductName L0 correções", () => {
  it("ADES sabor fruta → Bebidas, não Hortifrúti", () => {
    expect(classifyProductName("ADES LARANJA 250ML.").categoryName).toBe("Bebidas");
    expect(classifyProductName("ADES MACA 1L").categoryName).toBe("Bebidas");
    expect(classifyProductName("ADES ORIGINAL 1L").categoryName).toBe("Bebidas");
    expect(classifyProductName("ADESIVO ARALDITE 24H 39.5 G.").categoryName).not.toBe("Bebidas");
  });

  it("ALCAPARRA → Mercearia (não Utilidades por POTE)", () => {
    expect(classifyProductName("ALCAPARRA POTE PRAMESA 100G").categoryName).toBe(
      "Mercearia Seca e Básica",
    );
    expect(classifyProductName("ALCAPARRAS LA VIOLETERA 100G").categoryName).toBe(
      "Mercearia Seca e Básica",
    );
  });

  it("ALPINO BEBIDA → Bebidas; chocolate Alpino → Mercearia", () => {
    expect(classifyProductName("ALPINO BEBIDA GARRAFA 280ML").categoryName).toBe("Bebidas");
    expect(classifyProductName("ALPINO CHOCOLATE 100G").categoryName).toBe("Mercearia Seca e Básica");
  });

  it("POLPA contextual: fruta vs lácteo", () => {
    expect(classifyProductName("POLPA DE SIRIGUELA 100G POMAR").categoryName).toBe("Hortifrúti");
    expect(classifyProductName("POLPA MOLICO LIGHT 150G").categoryName).toBe("Frios e Laticínios");
    expect(classifyProductName("BEBIDA LACTEA C POLPA DE AMEIXA BETA 180").categoryName).toBe(
      "Frios e Laticínios",
    );
    expect(classifyProductName("NESTLE IOG POLPA MORANGO 85G").categoryName).toBe(
      "Frios e Laticínios",
    );
  });

  it("ANTI contextual: mofo vs bucal", () => {
    expect(classifyProductName("ANTI MOFO NOVICO LAVANDA 80G").categoryName).toBe("Limpeza");
    expect(classifyProductName("ANTI-SEPTICO BUCAL FLUORDENT MENTA 250ML").categoryName).toBe(
      "Higiene Pessoal",
    );
  });

  it("PASTILHA contextual: sanitária vs doce", () => {
    expect(classifyProductName("PASTILHA ADES PATO LAVANDA").categoryName).toBe("Limpeza");
    expect(classifyProductName("PASTILHA GAROTO MORANGO E MENTA 85G.").categoryName).toBe(
      "Mercearia Seca e Básica",
    );
    expect(classifyProductName("HALLS MENTA 28G").categoryName).toBe("Mercearia Seca e Básica");
  });

  it("GARNIER/LOLA só com tipo de higiene", () => {
    expect(classifyProductName("GARNIER FRUCTIS CABELOS NORMAIS 300ML.").categoryName).toBe(
      "Higiene Pessoal",
    );
    expect(classifyProductName("LOLA COND MORTE SUBITA HIDRAT 250G").categoryName).toBe(
      "Higiene Pessoal",
    );
  });

  it("preserva água mineral vs sanitária", () => {
    expect(classifyProductName("AGUA MINERAL CRISTAL 500ML").categoryName).toBe("Bebidas");
    expect(classifyProductName("AGUA SANITARIA 1L").categoryName).toBe("Limpeza");
  });
});

describe("classifyProductName última rodada baixo risco", () => {
  it("PRESTOBARBA → Higiene Pessoal", () => {
    expect(classifyProductName("PRESTOBARBA ULTRA GRIP C/2").categoryName).toBe("Higiene Pessoal");
    expect(classifyProductName("ESP. BARB. PRESTOBARBA SENSIVEL 150G").categoryName).toBe(
      "Higiene Pessoal",
    );
  });

  it("SOPAO → Mercearia", () => {
    expect(classifyProductName("SOPAO COSTELA KITANO 196G").categoryName).toBe(
      "Mercearia Seca e Básica",
    );
  });

  it("TIGELA utensílio; não captura popcorn Yoki", () => {
    expect(classifyProductName("TIGELA DURALEX").categoryName).toBe("Utilidades e Outros");
    expect(classifyProductName("POPCORN YOKI TIGELA").categoryName).not.toBe("Utilidades e Outros");
  });

  it("TOALHA(S) DE PAPEL → Descartáveis; toalha de banho ≠ descartável", () => {
    expect(classifyProductName("TOALHAS DE PAPEL KLASS 2 ROLOS").categoryName).toBe(
      "Produtos Descartáveis",
    );
    expect(classifyProductName("TOALHA DE PAPEL SORELLA 2ROLOS").categoryName).toBe(
      "Produtos Descartáveis",
    );
    expect(classifyProductName("TOALHA DE BANHO LUXO 140CMX70CM").categoryName).not.toBe(
      "Produtos Descartáveis",
    );
  });

  it("BOLA brinquedo no prefixo; não algodão/Cheetos", () => {
    expect(classifyProductName("BOLA PLAST-BRINQ. AMARELA").categoryName).toBe("Utilidades e Outros");
    expect(classifyProductName("ALGODAO BOLA COTONDELA 50G").categoryName).not.toBe(
      "Utilidades e Outros",
    );
    expect(classifyProductName("CHEETOS BOLA 34G").categoryName).toBe("Mercearia Seca e Básica");
  });

  it("BOM AR → Limpeza", () => {
    expect(classifyProductName("BOM AR LAVANDA 400ML").categoryName).toBe("Limpeza");
  });

  it("TESOURA contextual; genérica permanece sem classificação forçada", () => {
    expect(classifyProductName("TESOURA DE UNHA MUNDIAL INOX.").categoryName).toBe("Higiene Pessoal");
    expect(classifyProductName("TESOURA DE COSTURA TRAMONTINA 07").categoryName).toBe(
      "Utilidades e Outros",
    );
    const ambigua = classifyProductName("TESOURA SHEARS JD9606B");
    expect(["UNCLASSIFIED", "REVIEW_REQUIRED"]).toContain(ambigua.status);
  });
});
