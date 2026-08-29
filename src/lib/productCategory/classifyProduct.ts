/**
 * Classificação determinística de produtos Beira Rio / hortifruti multi-tenant.
 * Preferível a IA: auditável, previsível e sem persistência silenciosa em casos ambíguos.
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
}

export interface CatalogCategorySeed {
  name: CatalogCategoryName;
  sortOrder: number;
  description: string;
  icon: string;
  shortLabel: string;
}

export const CATALOG_CATEGORY_SEEDS: CatalogCategorySeed[] = [
  {
    name: "Hortifrúti",
    sortOrder: 10,
    description: "Frutas, verduras e legumes",
    icon: "🥬",
    shortLabel: "Hortifrúti",
  },
  {
    name: "Frios e Laticínios",
    sortOrder: 20,
    description: "Leites, queijos, iogurtes e frios",
    icon: "🧀",
    shortLabel: "Frios",
  },
  {
    name: "Mercearia Seca e Básica",
    sortOrder: 30,
    description: "Grãos, temperos, enlatados e secos",
    icon: "🛒",
    shortLabel: "Mercearia",
  },
  {
    name: "Bebidas",
    sortOrder: 40,
    description: "Águas, refrigerantes, sucos e energéticos",
    icon: "🥤",
    shortLabel: "Bebidas",
  },
  {
    name: "Padaria e Confeitaria",
    sortOrder: 50,
    description: "Pães, bolos e confeitaria",
    icon: "🥖",
    shortLabel: "Padaria",
  },
  {
    name: "Limpeza",
    sortOrder: 60,
    description: "Produtos de limpeza doméstica",
    icon: "🧹",
    shortLabel: "Limpeza",
  },
  {
    name: "Higiene Pessoal",
    sortOrder: 70,
    description: "Higiene e cuidados pessoais",
    icon: "🧴",
    shortLabel: "Higiene",
  },
  {
    name: "Utilidades e Outros",
    sortOrder: 80,
    description: "Utilidades domésticas e itens diversos",
    icon: "🧰",
    shortLabel: "Utilidades",
  },
  {
    name: "Produtos Descartáveis",
    sortOrder: 90,
    description: "Copos, pratos, filmes e sacos descartáveis",
    icon: "📦",
    shortLabel: "Descartáveis",
  },
];

/** Normaliza nome para matching (sem alterar o nome persistido). */
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

type Rule = {
  category: CatalogCategoryName;
  /** Peso se a palavra/frase aparecer como token ou substring delimitada */
  weight: number;
  patterns: string[];
};

/**
 * Regras ordenadas por especificidade. Padrões mais específicos têm peso maior.
 * Evita fuzzy matching excessivo.
 */
const RULES: Rule[] = [
  // --- Descartáveis (antes de limpeza/utilidades genéricos) ---
  {
    category: "Produtos Descartáveis",
    weight: 12,
    patterns: [
      "DESCARTAVEL",
      "DESCARTAVEIS",
      "COPO DESC",
      "PRATO DESC",
      "TALHER DESC",
      "PAPEL ALUMINIO",
      "FILME PVC",
      "FILME PLASTICO",
      "SACO LIXO",
      "SACO PARA LIXO",
      "SACO BD",
      "SACO P LIXO",
      "GUARDANAPO",
      "TOALHA DE PAPEL",
      "PAPEL TOALHA",
    ],
  },

  // --- Limpeza ---
  {
    category: "Limpeza",
    weight: 12,
    patterns: [
      "AGUA SANITARIA",
      "DESINFETANTE",
      "DETERGENTE",
      "AMACIANTE",
      "SABAO EM PO",
      "SABAO LIQUIDO",
      "SABAO EM BARRA",
      "LIMPADOR",
      "MULTIUSO",
      "ALVEJANTE",
      "REMOVEDOR",
      "ESPONJA",
      "PALHA DE ACO",
      "ODORIZADOR",
      "INSETICIDA",
      "DESENGORDURANTE",
    ],
  },
  {
    category: "Limpeza",
    weight: 8,
    patterns: ["SABAO", "LIMPEZA", "CLORO"],
  },

  // --- Higiene Pessoal ---
  {
    category: "Higiene Pessoal",
    weight: 12,
    patterns: [
      "SHAMPOO",
      "SH.",
      "CONDICIONADOR",
      "CONDIC.",
      "SABONETE",
      "CREME DENTAL",
      "PASTA DE DENTE",
      "DESODORANTE",
      "HIDRATANTE",
      "ABSORVENTE",
      "FRALDA",
      "LENCO UMEDECIDO",
      "ESCOVA DENTAL",
      "FIO DENTAL",
      "ANTISSEPTICO",
      "PROTETOR SOLAR",
      "AGUA COL",
      "AGUA DE COLONIA",
      "COLONIA",
      "PERFUME",
      "MAQUIAGEM",
      "APOS BARBA",
      "BARBEADOR",
      "LAMINA DE BARBEAR",
      "ALGODAO",
      "COTONETE",
      "REPELENTE",
    ],
  },
  {
    category: "Higiene Pessoal",
    weight: 8,
    patterns: ["CREME", "LOCAO", "POM POM"],
  },

  // --- Frios e Laticínios ---
  {
    category: "Frios e Laticínios",
    weight: 12,
    patterns: [
      "IOGURTE",
      "IOGURTE",
      "YOGURTE",
      "GREGO",
      "QUEIJO",
      "MUSSARELA",
      "MUSSARELA",
      "REQUEIJAO",
      "MANTEIGA",
      "MARGARINA",
      "PRESUNTO",
      "MORTADELA",
      "SALAME",
      "PEITO DE PERU",
      "CREME DE LEITE",
      "LEITE CONDENSADO",
      "LEITE EM PO",
      "LEITE INTEGRAL",
      "LEITE DESNATADO",
      "LEITE SEMIDESNATADO",
      "NATA",
      "COALHADA",
      "RICOTA",
      "COTTAGE",
      "DANONE",
      "ACTVIA",
      "CHANDON",
    ],
  },
  {
    category: "Frios e Laticínios",
    weight: 10,
    patterns: ["LEITE", "FRIOS", "LATICINIO"],
  },

  // --- Bebidas (água mineral vs água sanitária / colônia já cobertos) ---
  {
    category: "Bebidas",
    weight: 12,
    patterns: [
      "REFRIGERANTE",
      "REFRI ",
      "COCA COLA",
      "COCA-COLA",
      "GUARANA",
      "FANTA",
      "SPRITE",
      "SUCO ",
      "SUCO DE",
      "NECTAR",
      "ENERGETICO",
      "RED BULL",
      "MONSTER",
      "AGUA MINERAL",
      "AGUA COM GAS",
      "AGUA SEM GAS",
      "AGUA CRISTAL",
      "CERVEJA",
      "VINHO",
      "ESPUMANTE",
      "CHA MATE",
      "CHA GELADO",
      "ISOTONICO",
      "GATORADE",
      "COCO VERDE",
      "AGUA DE COCO",
    ],
  },
  {
    category: "Bebidas",
    weight: 9,
    patterns: ["AGUA ", " SUCO", "REFRIGER"],
  },

  // --- Padaria ---
  {
    category: "Padaria e Confeitaria",
    weight: 12,
    patterns: [
      "PAO ",
      "PAO DE",
      "PAO FRANCES",
      "PAO FORMA",
      "BISNAGA",
      "BOLO ",
      "TORTA ",
      "SONHO",
      "CROISSANT",
      "BROA",
      "ROSCA",
      "CUECA VIRADA",
      "CONFEITARIA",
      "PADARIA",
    ],
  },
  {
    category: "Padaria e Confeitaria",
    weight: 8,
    patterns: ["PAO", "BOLO", "TORTA"],
  },

  // --- Hortifrúti ---
  {
    category: "Hortifrúti",
    weight: 12,
    patterns: [
      "BANANA",
      "MACA ",
      "MACA GALA",
      "LARANJA",
      "TOMATE",
      "CEBOLA",
      "BATATA",
      "ALFACE",
      "COUVE",
      "CENOURA",
      "ABACAXI",
      "MANGA",
      "MELAO",
      "MELANCIA",
      "MAMAO",
      "UVA ",
      "MORANGO",
      "LIMAO",
      "PEPINO",
      "PIMENTAO",
      "ABOBORA",
      "ABOBRINHA",
      "CHUCHU",
      "BETERRABA",
      "RUCULA",
      "AGRIAO",
      "COENTRO",
      "SALSA",
      "CHEIRO VERDE",
      "BROCOLIS",
      "COUVE FLOR",
      "REPOLHO",
      "MILHO VERDE",
      "INHAME",
      "MANDIOCA",
      "AIPIM",
      "QUIABO",
      "VAGEM",
      "ALHO ",
      "GENGIBRE",
      "HORTIFRUTI",
      "HORTA",
    ],
  },
  {
    category: "Hortifrúti",
    weight: 8,
    patterns: ["FRUTA", "VERDURA", "LEGUME", "FOLHA"],
  },

  // --- Mercearia ---
  {
    category: "Mercearia Seca e Básica",
    weight: 12,
    patterns: [
      "ARROZ",
      "FEIJAO",
      "ACUCAR",
      "CAFE ",
      "CAFE MOIDO",
      "MACARRAO",
      "FARINHA",
      "OLEO DE",
      "OLEO SOJA",
      "AZEITE",
      "BISCOITO",
      "BOLACHA",
      "MOLHO",
      "TEMPERO",
      "CHOCOLATE",
      "ACHACOLATADO",
      "LEITE EM PO",
      "ENLATADO",
      "EXTRATO DE TOMATE",
      "CATCHUP",
      "KETCHUP",
      "MAIONESE",
      "MOSTARDA",
      "SAL ",
      "SAL GROSSO",
      "VINAGRE",
      "FERMENTO",
      "AVEIA",
      "GRANOLA",
      "CHIA ",
      "LINHACA",
      "SARDINHA",
      "ATUM",
      "MILHO CONSERVA",
      "ERVILHA",
      "SELETA",
      "FUBA",
      "AMIDO",
      "MAISENA",
      "COCO RALADO",
      "LEITE DE COCO",
      "CREME DE LEITE",
      "CATCHUP",
    ],
  },
  {
    category: "Mercearia Seca e Básica",
    weight: 8,
    patterns: ["CAFE", "OLEO", "TEMPERO", "MOLHO", "BISCOITO", "FARINHA", "ACUCAR", "FEIJAO", "ARROZ", "MACARRAO", "AZEITE", "VINAGRE", "CATCHUP", "KETCHUP", "MAIONESE", "MOSTARDA", "CHOCOLATE", "BALA ", "PIRULITO", "GOMA DE MASCAR", "AMENDOIM", "CASTANHA", "NOZES", "PASSA", "GELEIA", "DOCE DE", "COMPOTA", "CALDO ", "SOPA ", "MIOJO", "INSTANTANEO"],
  },

  // --- Bebidas extras ---
  {
    category: "Bebidas",
    weight: 10,
    patterns: ["SKOL", "BRAHMA", "ANTARCTICA", "HEINEKEN", "BUDWEISER", "CORONA", "EISENBAHN", "ITAIPAVA", "SCHIN", "PEPSI", "KUAT", "TONICA", "SODA ", "H2O ", "BONAFONT", "NESTLE PUREZA", "INDAIA", "PRATA ", "MINEIRINHO"],
  },

  // --- Higiene extras ---
  {
    category: "Higiene Pessoal",
    weight: 10,
    patterns: ["COLGATE", "SENSODYNE", "CLOSE UP", "ORAL B", "ORAL-B", "NIVEA", "DOVE", "LUX ", "JOHNSON", "PAMPERS", "HUGGIES", "ALWAYS", "INTIMUS", "CAREFREE", "REXONA", "AXE ", "GILLETTE", "BIC ", "MONANGE", "SEDA ", "PANTENE", "ELSEVE", "TRESEMME", "HEAD SHOULDERS", "CLEAR ", "CONDICIONADOR", "SHAMPOO"],
  },

  // --- Limpeza extras ---
  {
    category: "Limpeza",
    weight: 10,
    patterns: ["YPÊ", "YPE", "OMO ", "ARIEL", "TIXAN", "BRILHANTE", "VANISH", "CIF ", "VEJA ", "AJAX", "PINHO SOL", "CANDIDA", "QBOA", "ASSIM ", "COMFORT", "DOWNY", "FOFÓ", "FOFO"],
  },

  // --- Utilidades ---
  {
    category: "Utilidades e Outros",
    weight: 10,
    patterns: [
      "PILHA",
      "BATERIA",
      "LAMPADA",
      "FOSFORO",
      "ISQUEIRO",
      "VELA ",
      "PAPEL HIGIENICO",
      "FITA ADESIVA",
      "PRENDEDOR",
      "CABIDE",
      "VASSOURA",
      "RODO",
      "PANO DE PRATO",
      "PANO DE CHAO",
      "LUVA ",
      "PINPAD",
    ],
  },
];

const MIN_CLASSIFY_SCORE = 8;
const MIN_SCORE_GAP = 3;

function scoreName(normalized: string): Map<CatalogCategoryName, number> {
  const scores = new Map<CatalogCategoryName, number>();

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (!pattern) continue;
      if (normalized.includes(pattern)) {
        const prev = scores.get(rule.category) ?? 0;
        scores.set(rule.category, prev + rule.weight);
        break; // uma regra (peso) por bloco de patterns
      }
    }
  }

  return scores;
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
    };
  }

  // Exclusões: água sanitária ≠ bebida; água de colônia ≠ bebida
  let scores = scoreName(normalized);

  if (normalized.includes("AGUA SANITARIA") || normalized.includes("AGUA SANIT")) {
    scores.set("Limpeza", (scores.get("Limpeza") ?? 0) + 20);
    scores.delete("Bebidas");
  }
  if (
    normalized.includes("AGUA COL") ||
    normalized.includes("AGUA DE COLONIA") ||
    normalized.includes("COLONIA")
  ) {
    scores.set("Higiene Pessoal", (scores.get("Higiene Pessoal") ?? 0) + 20);
    scores.delete("Bebidas");
  }

  // CREME DE LEITE / LEITE CONDENSADO → mercearia prioriza sobre frios se ambos
  if (normalized.includes("CREME DE LEITE") || normalized.includes("LEITE CONDENSADO")) {
    scores.set("Mercearia Seca e Básica", (scores.get("Mercearia Seca e Básica") ?? 0) + 15);
  }

  // SH / CONDIC. com marca de higiene
  if (/\bSH\b/.test(normalized) || normalized.includes("CONDIC")) {
    scores.set("Higiene Pessoal", (scores.get("Higiene Pessoal") ?? 0) + 10);
  }

  const candidates = [...scores.entries()]
    .map(([categoryName, score]) => ({ categoryName, score }))
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    return {
      status: "UNCLASSIFIED",
      categoryName: null,
      confidence: 0,
      reason: "Nenhuma regra determinística correspondeu ao nome",
      candidates: [],
    };
  }

  const top = candidates[0]!;
  const second = candidates[1];

  if (top.score < MIN_CLASSIFY_SCORE) {
    return {
      status: "REVIEW_REQUIRED",
      categoryName: null,
      confidence: top.score / 30,
      reason: `Correspondência fraca com "${top.categoryName}" (score ${top.score})`,
      candidates,
    };
  }

  if (second && top.score - second.score < MIN_SCORE_GAP) {
    return {
      status: "REVIEW_REQUIRED",
      categoryName: null,
      confidence: (top.score - second.score) / 10,
      reason: `Ambiguidade entre "${top.categoryName}" e "${second.categoryName}"`,
      candidates,
    };
  }

  return {
    status: "CLASSIFIED",
    categoryName: top.categoryName,
    confidence: Math.min(1, top.score / 24),
    reason: `Classificado como "${top.categoryName}" (score ${top.score})`,
    candidates,
  };
}
