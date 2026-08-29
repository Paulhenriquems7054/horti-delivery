/**
 * Classificação determinística em camadas — Beira Rio / multi-tenant.
 * Camada 1: regras específicas de alta confiança (prefixos/expressões do catálogo real)
 * Camada 2: pontuação por padrões com desempate
 * Camada 3: REVIEW_REQUIRED / UNCLASSIFIED
 *
 * A normalização é só para análise — o nome comercial NÃO é alterado na persistência.
 */

export const CATALOG_CATEGORY_NAMES = [
  "Hortifrúti",
  "Frios e Laticínios",
  "Mercearia Seca e Básica",
  "Bebidas",
  "Padaria e Confeitaria",
  "Limpeza",
  "Higiene Pessoal",
  "Utilidades e Outros",
  "Produtos Descartáveis",
] as const;

export type CatalogCategoryName = (typeof CATALOG_CATEGORY_NAMES)[number];

export type ClassificationStatus = "CLASSIFIED" | "REVIEW_REQUIRED" | "UNCLASSIFIED";

export interface ClassificationResult {
  status: ClassificationStatus;
  categoryName: CatalogCategoryName | null;
  confidence: number;
  reason: string;
  candidates: Array<{ categoryName: CatalogCategoryName; score: number }>;
  layer?: "L0" | "L1" | "L2" | "NONE";
}

export interface CatalogCategorySeed {
  name: CatalogCategoryName;
  sortOrder: number;
  description: string;
  icon: string;
  shortLabel: string;
}

export const CATALOG_CATEGORY_SEEDS: CatalogCategorySeed[] = [
  { name: "Hortifrúti", sortOrder: 10, description: "Frutas, verduras e legumes", icon: "🥬", shortLabel: "Hortifrúti" },
  { name: "Frios e Laticínios", sortOrder: 20, description: "Leites, queijos, iogurtes e frios", icon: "🧀", shortLabel: "Frios" },
  { name: "Mercearia Seca e Básica", sortOrder: 30, description: "Grãos, temperos, enlatados e secos", icon: "🛒", shortLabel: "Mercearia" },
  { name: "Bebidas", sortOrder: 40, description: "Águas, refrigerantes, sucos e energéticos", icon: "🥤", shortLabel: "Bebidas" },
  { name: "Padaria e Confeitaria", sortOrder: 50, description: "Pães, bolos e confeitaria", icon: "🥖", shortLabel: "Padaria" },
  { name: "Limpeza", sortOrder: 60, description: "Produtos de limpeza doméstica", icon: "🧹", shortLabel: "Limpeza" },
  { name: "Higiene Pessoal", sortOrder: 70, description: "Higiene e cuidados pessoais", icon: "🧴", shortLabel: "Higiene" },
  { name: "Utilidades e Outros", sortOrder: 80, description: "Utilidades domésticas e itens diversos", icon: "🧰", shortLabel: "Utilidades" },
  { name: "Produtos Descartáveis", sortOrder: 90, description: "Copos, pratos, filmes e sacos descartáveis", icon: "📦", shortLabel: "Descartáveis" },
];

export function normalizeForClassification(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[#]/g, " ")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

type Layer1Rule = {
  id: string;
  category: CatalogCategoryName;
  test: (n: string) => boolean;
  reason: string;
};

/**
 * L0 — exceções e correções específicas (vence regras genéricas de fruta/pote/garrafa).
 */
export const LAYER0_RULES: Layer1Rule[] = [
  {
    id: "ades_bebida",
    category: "Bebidas",
    test: (n) =>
      /^ADES\b/.test(n) &&
      !/ADESIVO/.test(n) &&
      !/^ADES\s+FITA/.test(n) &&
      !/PASTILHA/.test(n),
    reason: "Bebida de soja ADES (não hortifrúti por sabor de fruta)",
  },
  {
    id: "alcaparra",
    category: "Mercearia Seca e Básica",
    test: (n) => /\bALCAPARRAS?\b/.test(n),
    reason: "Alcaparra em conserva (alimento, não utilidade/pote)",
  },
  {
    id: "alpino_bebida",
    category: "Bebidas",
    test: (n) => /\bALPINO BEBIDA\b/.test(n),
    reason: "Alpino Bebida (não utilidade por GARRAFA)",
  },
  {
    id: "alpino_doce",
    category: "Mercearia Seca e Básica",
    test: (n) =>
      /^ALPINO\b/.test(n) &&
      /(BOMBON|CHOCOLATE|COOKIE|WHITE|BISCOITO)/.test(n),
    reason: "Alpino chocolate / doce",
  },
  {
    id: "bebida_lactea",
    category: "Frios e Laticínios",
    test: (n) => /BEBIDA LACTEA/.test(n) || /\bCHAMYTO\b/.test(n),
    reason: "Bebida láctea / Chamyto (não hortifrúti por polpa/fruta)",
  },
  {
    id: "polpa_lactea",
    category: "Frios e Laticínios",
    test: (n) =>
      /\bPOLPA\b/.test(n) &&
      /(MOLICO|NINHO|NESTON|BETANIA|DANONE|DANONINHO|ACTIVIA|ACTIVA|IOG|GREGO|CORPUS|NESTLE)/.test(n),
    reason: "Polpa em contexto lácteo / iogurte",
  },
  {
    id: "polpa_fruta",
    category: "Hortifrúti",
    test: (n) =>
      /^POLPA\b/.test(n) &&
      !/(MOLICO|NINHO|NESTON|BETANIA|DANONE|IOG|GREGO|CORPUS|NESTLE)/.test(n) &&
      /(DE |CAJA|UMBU|ACEROLA|GOIABA|MANGA|MARACUJA|SIRIGUELA|LAVIE|POMAR|FRUTA)/.test(n),
    reason: "Polpa de fruta (congelada / hortifrúti)",
  },
  {
    id: "anti_mofo",
    category: "Limpeza",
    test: (n) => /ANTI[\s-]?MOFO/.test(n),
    reason: "Anti-mofo doméstico",
  },
  {
    id: "anti_septico_bucal",
    category: "Higiene Pessoal",
    test: (n) =>
      /(ANTI[\s-]?SEP|ANTISSEPT|ANTI[\s-]?CEPTICO|ANTISEPTICO)/.test(n) &&
      /(BUCAL|ORAL)/.test(n),
    reason: "Antisséptico bucal",
  },
  {
    id: "pastilha_sanitaria",
    category: "Limpeza",
    test: (n) =>
      /\bPASTILHA\b/.test(n) &&
      /(PATO|HARPIC|PRATIK|ADESIVA|\bADES\b|SANIT)/.test(n),
    reason: "Pastilha sanitária adesiva (vaso)",
  },
  {
    id: "pastilha_doce",
    category: "Mercearia Seca e Básica",
    test: (n) =>
      /\bPASTILHA\b/.test(n) &&
      /(GAROTO|HALLS|MENTA|MENTOL|CEREJA|DROPS)/.test(n) &&
      !/(PATO|HARPIC|PRATIK|ADESIVA)/.test(n),
    reason: "Pastilha/bala comestível",
  },
  {
    id: "garnier_higiene",
    category: "Higiene Pessoal",
    test: (n) =>
      /\bGARNIER\b/.test(n) &&
      /(FRUCTIS|CABELO|COND|SH|BI[\s-]?O|CREME|MASC|COLOR|ANTICASPA|SOFT|ENERGY)/.test(n),
    reason: "Garnier com tipo de higiene/cosmético",
  },
  {
    id: "lola_higiene",
    category: "Higiene Pessoal",
    test: (n) =>
      /\bLOLA\b/.test(n) &&
      /(COND|MASC|FINALIZADOR|HIDRAT|KIT|CREME|SH|CRONO|BOSSA|DREAM|DANOS|MORTE)/.test(n),
    reason: "Lola Cosmetics com tipo de higiene",
  },
  {
    id: "iog_abbrev",
    category: "Frios e Laticínios",
    test: (n) => /\bIOG\b/.test(n) || /^IOG\./.test(n),
    reason: "Abreviação IOG (iogurte)",
  },
];

/**
 * Ordem de prioridade L1 (primeira combinação vence).
 * Impede conflitos como AGUA SANITARIA→Bebidas e BISC→Padaria.
 */
export const LAYER1_RULES: Layer1Rule[] = [
  {
    id: "descartaveis_explicitos",
    category: "Produtos Descartáveis",
    test: (n) =>
      /\bDESCARTAV/.test(n) ||
      /PAPEL ALUMINIO/.test(n) ||
      /FILME (PVC|PLASTICO)/.test(n) ||
      /SACO (BD|LIXO|P LIXO|PARA LIXO)/.test(n) ||
      /\bGUARDANAPO\b/.test(n) ||
      /TOALHAS? DE PAPEL|PAPEL TOALHA|TOALHA DE PALEL/.test(n) ||
      /PRATO DESC|TALHER DESC|COPO DESC/.test(n),
    reason: "Descartável explícito / filme / saco / guardanapo",
  },
  {
    id: "copo_descartavel_contexto",
    category: "Produtos Descartáveis",
    test: (n) => /\bCOPO\b/.test(n) && /(DESC|PLAST|PS |PP |TRANSP)/.test(n),
    reason: "Copo em contexto descartável/plástico",
  },
  {
    id: "agua_sanitaria",
    category: "Limpeza",
    test: (n) => /AGUA SANIT/.test(n),
    reason: "Água sanitária",
  },
  {
    id: "limpeza_core",
    category: "Limpeza",
    test: (n) =>
      /\b(DESINFETANTE|DESINF|DETERGENTE|AMACIANTE|ALVEJANTE|REMOVEDOR|DESENGORDURANTE|INSETICIDA|ODORIZADOR)\b/.test(n) ||
      /\b(LAVA ROUPA|LAVA LOUCA|LAVA-LOUCA|LAVA LOUCAS)\b/.test(n) ||
      /^LAVA\b/.test(n) ||
      /^LIMPA\b/.test(n) ||
      /^AMAC\b/.test(n) ||
      /\bAMAC\./.test(n) ||
      /\bSABAO\b/.test(n) ||
      /\bESPONJA\b/.test(n) ||
      /PALHA DE ACO/.test(n) ||
      /\b(OMO|ARIEL|TIXAN|BRILHANTE|VANISH|CIF|VEJA|AJAX|CANDIDA|QBOA|YPE|COMFORT|DOWNY|FOFO)\b/.test(n) ||
      /PINHO SOL/.test(n) ||
      (/^CERA\b/.test(n) && !/CAPILAR|CABELO|MODELADOR/.test(n)),
    reason: "Limpeza doméstica / sabão / lava / desinfetante",
  },
  {
    id: "agua_colonia",
    category: "Higiene Pessoal",
    test: (n) =>
      /AGUA COL|AGUA DE COLONIA|\bCOLONIA\b|\bPERFUME\b/.test(n) ||
      /AGUA MICELAR/.test(n),
    reason: "Água de colônia / perfume / água micelar",
  },
  {
    id: "higiene_acetona",
    category: "Higiene Pessoal",
    test: (n) => /\bACETONA\b/.test(n),
    reason: "Acetona (removedor de esmalte)",
  },
  {
    id: "esmalte",
    category: "Higiene Pessoal",
    test: (n) =>
      /^ESM\b/.test(n) ||
      /\bESMALTE\b/.test(n) ||
      /\b(COLORAMA|RISQUE|IMPALA)\b/.test(n),
    reason: "Esmalte / marca de esmalte",
  },
  {
    id: "higiene_core",
    category: "Higiene Pessoal",
    test: (n) =>
      /\b(SHAMPOO|CONDICIONADOR|SABONETE|DESODORANTE|HIDRATANTE|ABSORVENTE|FRALDA|REPELENTE)\b/.test(n) ||
      /\b(DESOD|ABS)\b/.test(n) ||
      /\bSH\b/.test(n) ||
      /\bCONDIC\b/.test(n) ||
      (/^COND\b/.test(n) && !/CONDENSADO/.test(n)) ||
      /CREME DENTAL|PASTA DE DENTE|ESCOVA DENTAL|FIO DENTAL/.test(n) ||
      /LENCO UMEDECIDO|PROTETOR SOLAR|APOS BARBA|BARBEADOR/.test(n) ||
      /\b(COLGATE|SENSODYNE|NIVEA|DOVE|PAMPERS|HUGGIES|REXONA|GILLETTE|PANTENE|ELSEVE|TRESEMME|MONANGE|SEDA|PALMOLIVE|VITA CAPILI)\b/.test(n) ||
      (/^SAB\b/.test(n) && !/\bSABAO\b/.test(n)),
    reason: "Higiene pessoal / cosmético / fralda / desodorante",
  },
  {
    id: "bebidas_core",
    category: "Bebidas",
    test: (n) =>
      /\b(REFRIGERANTE|ENERGETICO|CERVEJA|VINHO|ESPUMANTE|ISOTONICO|NECTAR)\b/.test(n) ||
      /AGUA MINERAL|AGUA COM GAS|AGUA SEM GAS|AGUA DE COCO|AGUA CRISTAL/.test(n) ||
      /\b(COCA COLA|GUARANA|FANTA|SPRITE|PEPSI|KUAT|SKOL|BRAHMA|ANTARCTICA|HEINEKEN|ITAIPAVA|RED BULL|GATORADE|BONAFONT|H2O)\b/.test(n) ||
      /\bSUCO\b/.test(n) ||
      /^CHA\b/.test(n) ||
      /CHA MATE|CHA GELADO|CHA VERDE|CHA PRETO/.test(n) ||
      (/\bREF\b/.test(n) && /(COLA|GUARANA|LARANJA|UVA|LIMAO)/.test(n)),
    reason: "Bebida / refrigerante / água mineral / chá",
  },
  {
    id: "frios_core",
    category: "Frios e Laticínios",
    test: (n) =>
      /\b(IOGURTE|YOGURTE|QUEIJO|MUSSARELA|REQUEIJAO|MANTEIGA|MARGARINA|PRESUNTO|MORTADELA|SALAME|RICOTA|COTTAGE|NATA|COALHADA)\b/.test(n) ||
      /\bGREGO\b/.test(n) ||
      /\b(DANONE|DANONINHO|ACTIVIA|ACTIVA|ACTVIA|SADIA|PERDIGAO|SEARA|AURORA|FRIBOI)\b/.test(n) ||
      /ANONINHO/.test(n) ||
      (/\bLEITE\b/.test(n) && !/CONDENSADO|EM PO|DE COCO|CREME DE LEITE/.test(n)) ||
      /PEITO DE PERU|LINGUICA|SALSICHA|HAMBURGUER|EMPANADO/.test(n) ||
      (/\bFILE\b/.test(n) && /(FRANGO|PEIXE|MERLUZA|TILAPIA)/.test(n)) ||
      /DE FRANGO|COXA|SOBRECOXA|PEITO DE FRANGO/.test(n),
    reason: "Frios / laticínios / carnes refrigeradas",
  },
  {
    id: "padaria_core",
    category: "Padaria e Confeitaria",
    test: (n) =>
      !/^AMAC\b/.test(n) &&
      !/\bAMAC\./.test(n) &&
      (/\b(PAO|BOLO|TORTA|BISNAGA|CROISSANT|BROA|ROSCA|CONFEITARIA|PADARIA)\b/.test(n) ||
        /PAO DE|PAO FRANCES|PAO FORMA|CUECA VIRADA/.test(n) ||
        (/\bSONHO\b/.test(n) && !/AMAC|ROUPA|FACILITADOR/.test(n))),
    reason: "Padaria / confeitaria",
  },
  {
    id: "hortifruti_core",
    category: "Hortifrúti",
    test: (n) =>
      !/\b(DANONE|DANONINHO|ACTIVIA|ACTIVA|ACTVIA|IOGURTE|YOGURTE|ADES|BEBIDA|SUCO|PASTILHA|REFRESCO|NESTLE)\b/.test(
        n,
      ) &&
      !/ANONINHO/.test(n) &&
      !/\bIOG\b/.test(n) &&
      (/\b(BANANA|LARANJA|TOMATE|CEBOLA|BATATA|ALFACE|COUVE|CENOURA|ABACAXI|MANGA|MELAO|MELANCIA|MAMAO|MORANGO|LIMAO|PEPINO|PIMENTAO|ABOBORA|ABOBRINHA|CHUCHU|BETERRABA|RUCULA|AGRIAO|COENTRO|BROCOLIS|REPOLHO|INHAME|MANDIOCA|AIPIM|QUIABO|VAGEM|GENGIBRE|HORTIFRUTI)\b/.test(n) ||
        /\bMACA\b/.test(n) ||
        /\bUVA\b/.test(n) ||
        /\bALHO\b/.test(n) ||
        /CHEIRO VERDE|COUVE FLOR|MILHO VERDE/.test(n) ||
        /\b(FRUTA|VERDURA|LEGUME)\b/.test(n)),
    reason: "Fruta / verdura / legume",
  },
  {
    id: "sandalias",
    category: "Utilidades e Outros",
    test: (n) =>
      /^SAND\b/.test(n) ||
      /\bHAVAIANAS\b/.test(n) ||
      (/\bHAV\b/.test(n) && /(SLIM|KIDS|COLOR|TREND|TOP|HAVA|CITY|BASIC)/.test(n)) ||
      (/\bDUPE\b/.test(n) && /(SAND|MONOCOLOR|SUPER)/.test(n)) ||
      (/\bIPAN\b/.test(n) && /SAND/.test(n)),
    reason: "Sandália / calçado (SAND/HAV/DUPE do catálogo)",
  },
  {
    id: "mercearia_bisc",
    category: "Mercearia Seca e Básica",
    test: (n) => /^BISC\b/.test(n) || /\bBISCOITO\b/.test(n) || /\bBOLACHA\b/.test(n),
    reason: "Biscoito (inclui abreviação BISC do ERP)",
  },
  {
    id: "mercearia_core",
    category: "Mercearia Seca e Básica",
    test: (n) =>
      /\b(ARROZ|FEIJAO|ACUCAR|MACARRAO|FARINHA|AZEITE|MOLHO|TEMPERO|CHOCOLATE|MAIONESE|MOSTARDA|VINAGRE|FERMENTO|AVEIA|GRANOLA|SARDINHA|ATUM|FUBA|AMIDO|MAISENA|GELATINA|AZEITONA)\b/.test(n) ||
      /\bCAFE\b/.test(n) ||
      /\bOLEO\b/.test(n) ||
      (/^MAC\b/.test(n) && !/\bMACA\b/.test(n)) ||
      /\b(CHIA|LINHACA|BALAS|BALA|PIRULITO|GOMA|AMENDOIM|CASTANHA|GELEIA|MIOJO|CALDO|CATCHUP|KETCHUP)\b/.test(n) ||
      /LEITE CONDENSADO|CREME DE LEITE|LEITE EM PO|LEITE DE COCO|COCO RALADO/.test(n) ||
      /^CHOC\b/.test(n) ||
      /\bMARILAN\b/.test(n) ||
      /\bCAPRICCHE\b/.test(n),
    reason: "Mercearia seca / biscoito / enlatado / tempero",
  },
  {
    id: "utilidades_core",
    category: "Utilidades e Outros",
    test: (n) =>
      /\b(CADERNO|CANETA|LAPIS|BORRACHA|REGUA|ESTOJO|MOCHILA|COLA|GRAMPO|CLIPS)\b/.test(n) ||
      /^CAD\b/.test(n) ||
      /\b(PILHA|BATERIA|LAMPADA|FOSFORO|ISQUEIRO|CABIDE|VASSOURA|RODO|BACIA|CHUPETA|MAMADEIRA|RACAO|PINPAD)\b/.test(n) ||
      (/\bGARRAFA\b/.test(n) && !/\bBEBIDA\b/.test(n) && !/\bALPINO\b/.test(n)) ||
      (/\bPOTE\b/.test(n) && !/\bALCAPARRA/.test(n)) ||
      /PAPEL HIG|PAPEL HIGIENICO/.test(n) ||
      /PANO DE (PRATO|CHAO)/.test(n) ||
      /\bVELA\b/.test(n) ||
      /\bLUVA\b/.test(n) ||
      (/\bFITA\b/.test(n) && /ADESIVA|CREPE|ISOLANTE/.test(n)) ||
      /\b(JARRA|CANECA|BALAO|FORMA|EXTENSAO|TOMADA|ADAPTADOR|ORGANIZADOR|SUPORTE)\b/.test(n) ||
      /\b(FRISKIES|WHISKAS|PEDIGREE|GRAN PLUS|DOG CHOW)\b/.test(n),
    reason: "Utilidade doméstica / escolar / pet / papel higiênico",
  },
  {
    id: "limpeza_abbrev",
    category: "Limpeza",
    test: (n) => /^DETERG\b/.test(n) || /\bDETERG\b/.test(n),
    reason: "Abreviação DETERG (detergente)",
  },
  {
    id: "higiene_tintura_lencos",
    category: "Higiene Pessoal",
    test: (n) =>
      /\b(KOLESTON|TINTURA|COLORACAO|DESCOLORANTE)\b/.test(n) ||
      /\bLENCOS\b/.test(n) ||
      /\bLENCO\b/.test(n) ||
      (/^ESC\b/.test(n) && /(DENTAL|CABELO|CAPILAR)/.test(n)) ||
      (/^PASTA\b/.test(n) && /(DENTAL|DENTE)/.test(n)),
    reason: "Tintura / lenços / escova e pasta dental",
  },
  {
    id: "mercearia_snacks_azeitona",
    category: "Mercearia Seca e Básica",
    test: (n) =>
      /\b(AZEITONAS|AZEITONA)\b/.test(n) ||
      /\b(RUFFLES|DORITOS|CHEETOS|FANDANGOS|TORCIDA|CEBOLITOS|BACONZITOS)\b/.test(n) ||
      (/\bLAYS\b/.test(n) && !/ACETONA/.test(n)) ||
      (/^PASTA\b/.test(n) && /(TOMATE|AMENDOIM|AVELA|AMENDO)/.test(n)) ||
      (/^MASSA\b/.test(n) && /(ESPAGUETE|PENNE|PARAFUSO|LASANHA|INSTANT)/.test(n)) ||
      (/^POLPA\b/.test(n) && /(FRUTA|GOIABA|MANGA|ACEROLA|CAJU|MARACUJA|ABACAXI)/.test(n)),
    reason: "Snacks / azeitona / pasta alimentícia / polpa de fruta",
  },
  {
    id: "filme_descartavel",
    category: "Produtos Descartáveis",
    test: (n) => /^FILME\b/.test(n) || /\bFILME\b/.test(n) && /(PVC|PLAST|STRETCH|TRANSP)/.test(n),
    reason: "Filme plástico / PVC",
  },
  {
    id: "escova_utilidade",
    category: "Utilidades e Outros",
    test: (n) =>
      /^ESC\b/.test(n) ||
      (/\bESCOVA\b/.test(n) && !/DENTAL/.test(n)),
    reason: "Escova genérica / abreviação ESC (não dental)",
  },
  {
    id: "utilidades_cozinha_casa",
    category: "Utilidades e Outros",
    test: (n) =>
      /\b(PANELA|BALDE|CACAROLA|FACA|GARFO|COLHER|TABUA|PENEIRA|CADEADO|VELAS)\b/.test(n) ||
      /^PANO\b/.test(n) ||
      (/^PAPEL\b/.test(n) && !/HIG|ALUMINIO|TOALHA/.test(n)),
    reason: "Utensílios de cozinha / casa / papel genérico",
  },
  {
    id: "hortifruti_extra",
    category: "Hortifrúti",
    test: (n) =>
      !/\b(DANONE|DANONINHO|ACTIVIA|ACTIVA|ACTVIA|IOGURTE|YOGURTE|ADES|BEBIDA|PASTILHA|NESTLE)\b/.test(
        n,
      ) &&
      !/ANONINHO/.test(n) &&
      !/\bIOG\b/.test(n) &&
      /\b(AMEIXA|KIWI|GOIABA|CAQUI|PERA|PESSEGO|COCO SECO)\b/.test(n),
    reason: "Frutas adicionais do catálogo",
  },
  {
    id: "mercearia_extra",
    category: "Mercearia Seca e Básica",
    test: (n) =>
      /\b(CEREAL|LAMEN|NESCAU|NESCOFFE|NESCAFE|EXTRATO|ACHACOLATADO|TODDYNHO|SUCRILHOS|CORN FLAKES)\b/.test(n) ||
      /^EXTRATO\b/.test(n),
    reason: "Cereal / extrato / achocolatado",
  },
  {
    id: "bebida_prefix",
    category: "Bebidas",
    test: (n) => /^BEBIDA\b/.test(n),
    reason: "Prefixo BEBIDA",
  },
  {
    id: "higiene_talco_reparador",
    category: "Higiene Pessoal",
    test: (n) =>
      /\bTALCO\b/.test(n) ||
      /\bREPARADOR\b/.test(n) ||
      (/^CR\b/.test(n) &&
        /(DENTAL|FACIAL|CORPO|MAO|PE|HIDRAT|BARB|ASSADURA|TRAT|DENT)/.test(n) &&
        !/CHANTILLY/.test(n)),
    reason: "Talco / reparador capilar / creme (CR) contextual",
  },
  {
    id: "higiene_des_abreviado",
    category: "Higiene Pessoal",
    test: (n) =>
      /^DES\b/.test(n) &&
      /(AER|ROLL|AXE|GIOVANNA|NIVEA|NUVEA|REXONA|SPRAY|BODY)/.test(n),
    reason: "Abreviação DES = desodorante (catálogo Beira Rio)",
  },
  {
    id: "kit_higiene",
    category: "Higiene Pessoal",
    test: (n) =>
      /^KIT\b/.test(n) && /(ESM|BEAUTY|CABELO|COLOR|KOLESTON|TINTURA|SH|CONDIC)/.test(n),
    reason: "Kit de higiene / coloração / esmalte",
  },
  {
    id: "utilidades_eletrico_lixeira",
    category: "Utilidades e Outros",
    test: (n) =>
      /^PINO\b/.test(n) ||
      /\b(LIXEIRA|SABONETEIRA)\b/.test(n) ||
      /^CESTO\b/.test(n),
    reason: "Pino elétrico / lixeira / saboneteira / cesto",
  },
  {
    id: "pasta_escolar",
    category: "Utilidades e Outros",
    test: (n) =>
      /^PASTA\b/.test(n) && /(ABA|ELASTICO|OFICIO|FANTASIA|ESCOLAR|CADARNO)/.test(n),
    reason: "Pasta escolar / arquivo (não alimentícia)",
  },
  {
    id: "descartaveis_canudos",
    category: "Produtos Descartáveis",
    test: (n) => /\bCANUDOS?\b/.test(n),
    reason: "Canudos descartáveis",
  },
  {
    id: "mercearia_chicle_achocolatado",
    category: "Mercearia Seca e Básica",
    test: (n) =>
      /\b(CHICLE|ACHACOLATADO|ACHOCOLATADO|CHANTILLY)\b/.test(n) ||
      /^ACHOC\b/.test(n),
    reason: "Chiclete / achocolatado / chantilly",
  },
  {
    id: "limpeza_limp_prefix",
    category: "Limpeza",
    test: (n) => /^LIMP\b/.test(n) || /\bLIMPADOR\b/.test(n),
    reason: "Abreviação LIMP / limpador",
  },
  {
    id: "limpeza_alcool",
    category: "Limpeza",
    test: (n) => /\bALCOOL\b/.test(n) && !/GEL HIDRAT|ANTISSEPTICO CAPILAR/.test(n),
    reason: "Álcool para limpeza / assepsia doméstica",
  },
  {
    id: "limpeza_harpic_lustra",
    category: "Limpeza",
    test: (n) => /\b(HARPIC|LUSTRA|DESINCRUSTANTE|LIMPA PEDRA)\b/.test(n) || /^LUSTRA\b/.test(n),
    reason: "Harpic / lustra-móveis / limpeza especializada",
  },
  {
    id: "bebidas_cerv",
    category: "Bebidas",
    test: (n) => /^CERV\b/.test(n) || /\bCERV\b/.test(n),
    reason: "Abreviação CERV (cerveja)",
  },
  {
    id: "mercearia_sal_adocante_palmito",
    category: "Mercearia Seca e Básica",
    test: (n) =>
      /\b(ADOCANTE|PALMITO|MILHO VERDE CONSERVA)\b/.test(n) ||
      (/^SAL\b/.test(n) && !/SALAME|SALSICHA|SALMAO/.test(n)) ||
      /^MASSA\b/.test(n) ||
      /^MAS\b/.test(n),
    reason: "Sal / adoçante / palmito / massa",
  },
  {
    id: "hortifruti_ovos",
    category: "Hortifrúti",
    test: (n) => /\bOVOS\b/.test(n) || /^OVO\b/.test(n),
    reason: "Ovos (seção hortifrúti/fresco)",
  },
  {
    id: "utilidades_extra",
    category: "Utilidades e Outros",
    test: (n) =>
      (/\b(FRIGIDEIRA|MANGUEIRA|PRENDEDOR|CIGARRO|ISQUEIRO)\b/.test(n) ||
        (/\bTOALHA\b/.test(n) && !/PAPEL|PALEL/.test(n))) ||
      /^FITA\b/.test(n),
    reason: "Utensílios / fita / toalha de tecido / tabaco acessório",
  },
  {
    id: "saco_descartavel",
    category: "Produtos Descartáveis",
    test: (n) => /^SACO\b/.test(n) || /\bGUARDANAPOS\b/.test(n),
    reason: "Saco / guardanapos (embalagem descartável)",
  },
  {
    id: "mercearia_doces_temperos",
    category: "Mercearia Seca e Básica",
    test: (n) =>
      /\b(GOIABADA|PUDIM|ERVILHA|CANELA|ORÉGANO|OREGANO|LOURO|COLORAU|PIMENTA)\b/.test(n) ||
      /^MEL\b/.test(n),
    reason: "Doces / ervilha / temperos / mel",
  },
  {
    id: "utilidades_bandeja_led",
    category: "Utilidades e Outros",
    test: (n) =>
      /\b(BANDEJA|LED|CONJ|PORTA)\b/.test(n) ||
      /^TINTA\b/.test(n) ||
      /^TINT\b/.test(n),
    reason: "Bandeja / LED / conjunto / tinta",
  },
  // --- Famílias mineradas dos UNCLASSIFIED (alta confiança) ---
  {
    id: "bebidas_destilados",
    category: "Bebidas",
    test: (n) => /\b(VODKA|WHISKY|WHISKEY|GIN|CACHACA|LICOR|CONHAQUE|TEQUILA|RUM)\b/.test(n),
    reason: "Destilados / bebidas alcoólicas",
  },
  {
    id: "mercearia_cookies_halls_mucilon",
    category: "Mercearia Seca e Básica",
    test: (n) =>
      /\b(COOKIES|COOKIE|HALLS|MUCILON|FLOCOS|SOPA)\b/.test(n) ||
      /^PIC\b/.test(n) ||
      /^REFRESCO\b/.test(n) ||
      /MAIS SABOR/.test(n),
    reason: "Cookies / Halls / Mucilon / flocos / sopa / refresco em pó",
  },
  {
    id: "utilidades_casa_cozinha",
    category: "Utilidades e Outros",
    test: (n) =>
      /\b(CUSCUZEIRO|XICARA|TAPETE|CAPACHO)\b/.test(n),
    reason: "Utensílio / tapete / xícara",
  },
  {
    id: "descartaveis_sacos",
    category: "Produtos Descartáveis",
    test: (n) =>
      /^SACOS\b/.test(n) ||
      (/^SACO\b/.test(n) && /(LIXO|FREEZER|GELADINHO|PIPOCA)/.test(n)),
    reason: "Sacos (lixo / freezer / geladinho)",
  },
  {
    id: "limpeza_inset_pratice_desodor",
    category: "Limpeza",
    test: (n) =>
      /^INSET\b/.test(n) ||
      /\bINSETICIDA\b/.test(n) ||
      /^PRATICE\b/.test(n) ||
      (/^DESODOR\b/.test(n) && !/DESODORANTE/.test(n)),
    reason: "Inseticida / Pratice / desodorizador ambiente",
  },
  {
    id: "frios_lasanha",
    category: "Frios e Laticínios",
    test: (n) =>
      /\bLASANHA\b/.test(n) &&
      !/(DONA BENTA|ONDULADA|MASSA SECA)/.test(n),
    reason: "Lasanha pronta/congelada",
  },
  {
    id: "mercearia_lasanha_massa",
    category: "Mercearia Seca e Básica",
    test: (n) => /\bLASANHA\b/.test(n) && /(DONA BENTA|ONDULADA)/.test(n),
    reason: "Massa de lasanha seca",
  },
  {
    id: "higiene_pedra_pome",
    category: "Higiene Pessoal",
    test: (n) => /PEDRA POM/.test(n),
    reason: "Pedra-pomes (higiene dos pés)",
  },
  // --- Última rodada: grupos de baixo risco ---
  {
    id: "higiene_prestobarba",
    category: "Higiene Pessoal",
    test: (n) => /\bPRESTOBARBA\b/.test(n),
    reason: "Prestobarba (aparelho / espuma de barbear)",
  },
  {
    id: "mercearia_sopao",
    category: "Mercearia Seca e Básica",
    test: (n) => /\bSOPAO\b/.test(n),
    reason: "Sopão (sopa seca industrializada)",
  },
  {
    id: "utilidades_tigela",
    category: "Utilidades e Outros",
    test: (n) => /^TIGELA\b/.test(n),
    reason: "Tigela utensílio (prefixo; exclui popcorn Yoki Tigela)",
  },
  {
    id: "utilidades_bola_brinquedo",
    category: "Utilidades e Outros",
    test: (n) => /^BOLA\b/.test(n),
    reason: "Bola brinquedo/lazer (prefixo; exclui algodão/Cheetos)",
  },
  {
    id: "limpeza_bom_ar",
    category: "Limpeza",
    test: (n) => /\bBOM AR\b/.test(n),
    reason: "Bom Ar (aromatizador / desodorizador ambiente)",
  },
  {
    id: "higiene_tesoura_unha",
    category: "Higiene Pessoal",
    test: (n) => /\bTESOURA\b/.test(n) && /\bUNHAS?\b/.test(n),
    reason: "Tesoura de unha",
  },
  {
    id: "higiene_tesoura_cabeleireiro",
    category: "Higiene Pessoal",
    test: (n) => /\bTESOURA\b/.test(n) && /CABELE/.test(n),
    reason: "Tesoura de cabeleireiro",
  },
  {
    id: "utilidades_tesoura_contexto",
    category: "Utilidades e Outros",
    test: (n) =>
      /\bTESOURA\b/.test(n) && /(ESCOLAR|COSTURA)/.test(n) && !/\bUNHAS?\b/.test(n),
    reason: "Tesoura escolar / costura",
  },
];

type ScoreRule = {
  category: CatalogCategoryName;
  weight: number;
  patterns: string[];
};

const LAYER2_RULES: ScoreRule[] = [
  { category: "Produtos Descartáveis", weight: 10, patterns: ["COPO ", "PRATO ", "TALHER ", "MARMITA"] },
  { category: "Limpeza", weight: 9, patterns: ["LIMPEZA", "CLORO", "MULTIUSO", "LIMPADOR"] },
  { category: "Higiene Pessoal", weight: 9, patterns: ["CREME", "LOCAO", "GEL ", "MAQUIAGEM", "ALGODAO", "COTONETE", "ESCOVA"] },
  { category: "Bebidas", weight: 8, patterns: ["AGUA ", "TONICA", "SODA ", "SCHIN", "CORONA", "EISENBAHN"] },
  { category: "Frios e Laticínios", weight: 8, patterns: ["FRIOS", "LATICINIO", "IOG ", "IOGUR"] },
  { category: "Padaria e Confeitaria", weight: 8, patterns: ["SONHO", "BROA"] },
  { category: "Hortifrúti", weight: 8, patterns: ["FOLHA", "SALSA"] },
  { category: "Mercearia Seca e Básica", weight: 8, patterns: ["TEMPERO", "MOLHO", "FARINHA", "ACUCAR", "FEIJAO", "ARROZ"] },
  { category: "Utilidades e Outros", weight: 7, patterns: ["PRENDEDOR", "ORGANIZADOR", "SUPORTE"] },
];

const MIN_L2_SCORE = 8;
const MIN_L2_GAP = 3;

function scoreLayer2(normalized: string): Map<CatalogCategoryName, number> {
  const scores = new Map<CatalogCategoryName, number>();
  for (const rule of LAYER2_RULES) {
    for (const pattern of rule.patterns) {
      if (normalized.includes(pattern)) {
        scores.set(rule.category, (scores.get(rule.category) ?? 0) + rule.weight);
        break;
      }
    }
  }
  return scores;
}

function classified(
  category: CatalogCategoryName,
  reason: string,
  layer: "L0" | "L1" | "L2",
  confidence: number,
  candidates: ClassificationResult["candidates"] = [],
): ClassificationResult {
  return {
    status: "CLASSIFIED",
    categoryName: category,
    confidence,
    reason,
    candidates: candidates.length ? candidates : [{ categoryName: category, score: confidence * 24 }],
    layer,
  };
}

export function classifyProductName(productName: string): ClassificationResult {
  const normalized = normalizeForClassification(productName);
  if (!normalized) {
    return {
      status: "UNCLASSIFIED",
      categoryName: null,
      confidence: 0,
      reason: "Nome do produto vazio",
      candidates: [],
      layer: "NONE",
    };
  }

  for (const rule of LAYER0_RULES) {
    if (rule.test(normalized)) {
      return classified(rule.category, `L0[${rule.id}]: ${rule.reason}`, "L0", 0.98);
    }
  }

  for (const rule of LAYER1_RULES) {
    if (rule.test(normalized)) {
      return classified(rule.category, `L1[${rule.id}]: ${rule.reason}`, "L1", 0.95);
    }
  }

  const scores = scoreLayer2(normalized);

  if (/AGUA SANIT/.test(normalized)) {
    scores.set("Limpeza", (scores.get("Limpeza") ?? 0) + 20);
    scores.delete("Bebidas");
  }
  if (/AGUA COL|COLONIA/.test(normalized)) {
    scores.set("Higiene Pessoal", (scores.get("Higiene Pessoal") ?? 0) + 20);
    scores.delete("Bebidas");
  }
  if (/LEITE CONDENSADO|CREME DE LEITE/.test(normalized)) {
    scores.set("Mercearia Seca e Básica", (scores.get("Mercearia Seca e Básica") ?? 0) + 15);
  }

  const candidates = [...scores.entries()]
    .map(([categoryName, score]) => ({ categoryName, score }))
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    return {
      status: "UNCLASSIFIED",
      categoryName: null,
      confidence: 0,
      reason: "Nenhuma regra L1/L2 correspondeu ao nome",
      candidates: [],
      layer: "NONE",
    };
  }

  const top = candidates[0]!;
  const second = candidates[1];

  if (top.score < MIN_L2_SCORE) {
    return {
      status: "REVIEW_REQUIRED",
      categoryName: null,
      confidence: top.score / 30,
      reason: `L2 fraca com "${top.categoryName}" (score ${top.score})`,
      candidates,
      layer: "L2",
    };
  }

  if (second && top.score - second.score < MIN_L2_GAP) {
    return {
      status: "REVIEW_REQUIRED",
      categoryName: null,
      confidence: (top.score - second.score) / 10,
      reason: `Ambiguidade L2 entre "${top.categoryName}" e "${second.categoryName}"`,
      candidates,
      layer: "L2",
    };
  }

  return classified(
    top.categoryName,
    `L2: ${top.categoryName} (score ${top.score})`,
    "L2",
    Math.min(1, top.score / 20),
    candidates,
  );
}
