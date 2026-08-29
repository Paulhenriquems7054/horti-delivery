/**
 * Auditoria final dos UNCLASSIFIED — somente análise, sem classificar.
 * Local only — não altera classificador, decisões nem Hosted.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";
import {
  cellValueToString,
  normalizeIdentifier,
  normalizeProductName,
  resolveBeiraRioColumns,
} from "../src/lib/productImport/normalize.ts";
import { parseBrazilianPrice } from "../src/lib/productImport/parseBrazilianPrice.ts";
import { annotateSpreadsheetDuplicates } from "../src/lib/productImport/dedupe.ts";
import {
  CATALOG_CATEGORY_NAMES,
  classifyProductName,
  type CatalogCategoryName,
} from "../src/lib/productCategory/classifyProduct.ts";
import {
  buildReviewGroup,
  categoryOverlayFromDecisions,
  computePipelineAfterDecisions,
  loadDecisionStore,
  makeReviewId,
  prioritizeReviewGroups,
  verifyPipelineIntegrity,
  type ManualReviewDecision,
  type ManualReviewGroup,
  type ReviewConfidence,
  type ReviewProductRef,
} from "../src/lib/productCategory/manualReview.ts";

const FILE = path.join("Lista de Produtos", "RELAÇÃO DE PRODUTOS - BEIRA RIO.xlsx");
const DECISIONS_PATH = path.join("scripts", "manual-review-decisions.json");
const REPORT_PATH = path.join("scripts", "final-unclassified-audit.json");

type AuditStatus = "CLEARLY_CLASSIFIABLE" | "AMBIGUOUS" | "INSUFFICIENT";

/** Grupos conhecidamente ambíguos — múltiplos significados por prefixo/marca. */
const KNOWN_AMBIGUOUS_KEYS = new Set([
  "NINHO",
  "KIT",
  "CORPO",
  "TESOURA",
  "ESP",
  "PASTILHA",
  "GARNIER",
  "LOLA",
  "COPOS",
  "COPO",
  "FORT",
  "COLOR",
  "CJ",
  "CONJUNTO",
  "CONJ",
  "CHOC",
  "CREME",
  "TOALHA",
  "CAFE",
  "CAIXA",
  "GRAFITE",
  "POTE",
  "REFIL",
  "REF",
  "MINI",
  "MAX",
  "SUPER",
  "ULTRA",
  "PRO",
  "PLUS",
  "GOLD",
  "PREMIUM",
]);

/** Marcas isoladas — sem tipo de produto inferível pelo prefixo. */
const BRAND_ONLY_KEYS = new Set([
  "NESTLE",
  "YOKI",
  "DORI",
  "GAROTO",
  "LACTA",
  "MAGgi",
  "KNORR",
  "OMO",
  "ARIEL",
  "DOWNY",
  "COLGATE",
  "ORAL",
  "JOHNSON",
  "JOHNS",
]);

interface AuditSemanticResult {
  families: Set<string>;
  suggestedCategory: CatalogCategoryName | null;
  confidence: ReviewConfidence;
  evidence: string;
}

function normalizeAuditName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s./-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Análise semântica expandida — exclusiva desta auditoria, não altera classificador. */
function auditSemanticScan(name: string): AuditSemanticResult {
  const n = normalizeAuditName(name);
  const families = new Set<string>();

  const add = (family: string) => families.add(family);

  if (/^BOM\s*AR\b|BOMAR\b|AROMATIZANTE|DESODORIZ|ODORIZ|AMBIENTADOR/.test(n)) add("limpeza_ar");
  else if (/PINHO\s+(BRIL|TROP)|DESINFET|LIMPADOR|LIMPA\s|MULTIUSO|DETERG|ALVEJ|SABAO\s+EM\s+PO|SABAO\s+PO|AGUA\s+SANIT|CANDURA|VEJA\b|YPE\b|ASSOLAN|CIF\b|VANISH|TIRA\s+MANCHA/.test(n))
    add("limpeza");
  else if (/PRESTOBARBA|AP\s*\.?\s*BARB|LAMINA\s+DE\s+BARB|ESP\s+BARB|GILETE|APARELHO\s+BARB/.test(n))
    add("higiene_barba");
  else if (/SHAMPOO|CONDIC|CR\s*\.?\s*PENT|CREME\s+PENT|TINTURA|COLORACAO|GUANIDINA|ALISANTE|NEUTRALIZ|RETOQUE|REP\s+PONT|DESCOLOR|PERMANENTE|FIXADOR|GEL\s+CAPIL|MOUSSE\s+CAPIL/.test(n))
    add("higiene_cabelo");
  else if (/SABONETE|DESOD\s|ANTITransp|HIDRAT\s|CREME\s+CORP|LOCAO\s+(CORP|HIDR)|PROTETOR\s+SOLAR|ABS\s|ABSORVENTE|FRALDA|PAPEL\s+HIG/.test(n))
    add("higiene_corpo");
  else if (/PENTE\b|ESCOVA\s+(CAPIL|DENT)|FIO\s+DENTAL|CREME\s+DENT|ENXAG\s+BUC/.test(n))
    add("higiene_acessorio");
  else if (/BATON\b|CHOCOLATE|CHOC\.|BISCOITO|BOLACH|COOK|BALA\b|GOMA\s|PIPOCA\s+DOCE|AMENDOIM|SNACK|SALGADINHO|PINGO\s+D/.test(n))
    add("mercearia_doce");
  else if (/MACARRAO|MASSA\b|ARROZ\b|FEIJAO|FARINHA|ACUCAR\b|CAFE\b|CAFE\s|MOLHO\b|EXTRATO|TEMPERO|SOPA\b|SOPAO|PROTEINA\s+DE\s+SOJA|OLEO\s+(COMEST|SOJA|GIRASS)|VINAGRE|AZEITE|ATUM|ENLAT|SARDIN|MILHO\s+VERDE|ERVILHA|SELETA\s+DE\s+LEG/.test(n))
    add("mercearia_salgada");
  else if (/CERVEJA|VINHO\b|VODKA|WHISKY|AGUA\s+(MIN|TON|GAS)|REFRI|COCA|GUARANA|FANTA|SPRITE|SUCO\b|NECTAR|CHOPP|ENERGET/.test(n))
    add("bebida");
  else if (/TORRADA|BOLINHO|BOLO\b|PAO\b|ROSQUINHA|BROA\b|BISCOITO\s+CASEIRO|CONFEIT/.test(n))
    add("padaria");
  else if (/FILE\s+DE|CAMARAO|PEIXE\b|BACALHAU|SALMAO|TILAPIA|HORTI|LEGUME\b|FRUTA\b|BANANA|MACA\b|TOMATE|BATATA\s+DOCE|ALFACE|COUVE|BROCOLIS|SELETA\s/.test(n))
    add("hortifruti");
  else if (/QUEIJO|MORTADEL|PRESUNTO|SALAME|LINGUIC|IOGURTE|REQUEIJ|MANTEIGA|LEITE\b(?!IRO)/.test(n))
    add("frios");
  else if (/COPOS?\s+DESC|PRATOS?\s+DESC|TALHER\s+DESC|GUARDANAPO|TOALHA\s+(DE\s+PAPEL|PAPER)|ROLO\s+PAPEL|PAPEL\s+ALUM|FILME\s+PVC|SACOLA\s+PLAST|EMBALAG\s+DESC/.test(n))
    add("descartavel");
  else if (/TORNEIRA|BALAO|BALOES|CAIXA\s+PLAST|POTE\s+PLAST|TIGELA\b|PRATO\s+(PLAST|MELAM)|COPO\s+(PLAST|NADIR|CISPER)|UTENSIL|FORM\b|ASSADEIRA|FRIGIDEIRA|PANELA|ALICATE\s+(UNHA|CABO)|TESOURA\s+(CABELO|UNHA)|ESPELHO\b|ORGANIZAD/.test(n))
    add("utilidades");
  else if (/NINHO\b/.test(n) && /VINHO|CABERNET|AFFANI|750ML/.test(n)) add("bebida_vinho");
  else if (/NINHO\b|LEITE\s+NINHO|LEPO\b|LACT\b/.test(n)) add("lacteo_ambiguo");
  else if (/\bKIT\b/.test(n)) add("kit_ambiguo");
  else if (/CORPO\s+A\s+CORPO/.test(n)) add("higiene_corpo");
  else if (/CORPO\s+E\s+SABOR/.test(n)) add("mercearia_doce");
  else if (/\bCORPO\b/.test(n)) add("corpo_ambiguo");
  else if (/PASTILHA/.test(n) && /ADES|REFR|HALLS|TRIDENT/.test(n)) add("mercearia_doce");
  else if (/PASTILHA/.test(n) && /SANIT|TANQUE|DESOD/.test(n)) add("limpeza");
  else if (/PASTILHA/.test(n)) add("pastilha_ambiguo");
  else if (/TESOURA/.test(n)) add("tesoura_ambiguo");
  else if (/^ESP\b/.test(n)) add("esp_ambiguo");
  else if (/\bFORT\b/.test(n) && /INSET|MATA|BARATA|FORMIGA/.test(n)) add("limpeza");
  else if (/\bFORT\b/.test(n)) add("fort_ambiguo");
  else if (/COPOS?\b/.test(n) && !/DESC/.test(n)) add("copo_ambiguo");
  else if (/COPOS?\b/.test(n)) add("descartavel");
  else if (/COLOR\s+(CASTING|GLOSS|NATUR)/.test(n)) add("higiene_cabelo");
  else if (/\bCOLOR\b/.test(n)) add("color_ambiguo");
  else if (n.length <= 3 || /^[0-9]+$/.test(n) || /^[A-Z]{1,2}$/.test(n)) add("insuficiente");
  else if (/^(PROD|ITEM|DIV|DIVERSOS|UNIT|UNID|REF\s*\d|COD\s*\d)/.test(n)) add("insuficiente");
  else add("outro");

  const familyToCategory: Record<string, CatalogCategoryName> = {
    limpeza_ar: "Limpeza",
    limpeza: "Limpeza",
    higiene_barba: "Higiene Pessoal",
    higiene_cabelo: "Higiene Pessoal",
    higiene_corpo: "Higiene Pessoal",
    higiene_acessorio: "Higiene Pessoal",
    mercearia_doce: "Mercearia Seca e Básica",
    mercearia_salgada: "Mercearia Seca e Básica",
    bebida: "Bebidas",
    padaria: "Padaria e Confeitaria",
    hortifruti: "Hortifrúti",
    frios: "Frios e Laticínios",
    descartavel: "Produtos Descartáveis",
    utilidades: "Utilidades e Outros",
  };

  const ambiguousFamilies = new Set([
    "lacteo_ambiguo",
    "kit_ambiguo",
    "corpo_ambiguo",
    "pastilha_ambiguo",
    "tesoura_ambiguo",
    "esp_ambiguo",
    "fort_ambiguo",
    "copo_ambiguo",
    "color_ambiguo",
    "bebida_vinho",
    "outro",
    "insuficiente",
  ]);

  const classifiableFamilies = [...families].filter((f) => !ambiguousFamilies.has(f));
  const categories = new Set(
    classifiableFamilies.map((f) => familyToCategory[f]).filter(Boolean),
  );

  if (categories.size === 1) {
    const cat = [...categories][0]!;
    const conf: ReviewConfidence =
      classifiableFamilies.some((f) =>
        ["limpeza", "limpeza_ar", "higiene_barba", "descartavel"].includes(f),
      )
        ? "alta"
        : "media";
    return {
      families,
      suggestedCategory: cat,
      confidence: conf,
      evidence: `Família semântica: ${[...classifiableFamilies].join(", ")}`,
    };
  }

  if (categories.size >= 2) {
    return {
      families,
      suggestedCategory: null,
      confidence: "nenhuma",
      evidence: `Famílias conflitantes: ${[...families].join(", ")} → categorias ${[...categories].join(" vs ")}`,
    };
  }

  if ([...families].some((f) => ambiguousFamilies.has(f) && f !== "outro" && f !== "insuficiente")) {
    return {
      families,
      suggestedCategory: null,
      confidence: "nenhuma",
      evidence: `Padrão ambíguo: ${[...families].join(", ")}`,
    };
  }

  return {
    families,
    suggestedCategory: null,
    confidence: "baixa",
    evidence: "Sem família semântica classificável identificada",
  };
}

function auditGroup(group: ManualReviewGroup): {
  status_final: AuditStatus;
  categoria_sugerida: CatalogCategoryName | null;
  confianca: ReviewConfidence;
  motivo: string;
  high_confidence: boolean;
} {
  const names = group.products.map((p) => p.name);

  if (KNOWN_AMBIGUOUS_KEYS.has(group.groupKey)) {
    return {
      status_final: "AMBIGUOUS",
      categoria_sugerida: group.suggestion,
      confianca: group.confidence,
      motivo: `Prefixo '${group.groupKey}' conhecido por múltiplos significados de produto`,
      high_confidence: false,
    };
  }

  if (group.heterogeneous) {
    return {
      status_final: "AMBIGUOUS",
      categoria_sugerida: null,
      confianca: "nenhuma",
      motivo: group.heterogeneityReason ?? "Grupo heterogêneo detectado",
      high_confidence: false,
    };
  }

  if (BRAND_ONLY_KEYS.has(group.groupKey.toUpperCase())) {
    return {
      status_final: "INSUFFICIENT",
      categoria_sugerida: null,
      confianca: "baixa",
      motivo: "Prefixo corresponde a marca — tipo de produto não inferível",
      high_confidence: false,
    };
  }

  const perProduct = names.map((name) => auditSemanticScan(name));
  const allFamilies = new Set<string>();
  const categories = new Set<CatalogCategoryName>();
  for (const scan of perProduct) {
    for (const f of scan.families) allFamilies.add(f);
    if (scan.suggestedCategory) categories.add(scan.suggestedCategory);
  }

  const ambiguousInScan = [...allFamilies].filter((f) =>
    /ambiguo|insuficiente/.test(f),
  );
  const hasAmbiguousFamily = ambiguousInScan.length > 0 && allFamilies.size > 1;

  if (categories.size >= 2 || hasAmbiguousFamily) {
    return {
      status_final: "AMBIGUOUS",
      categoria_sugerida: null,
      confianca: "nenhuma",
      motivo:
        categories.size >= 2
          ? `Categorias conflitantes no grupo: ${[...categories].join(", ")}`
          : `Famílias ambíguas: ${ambiguousInScan.join(", ")}`,
      high_confidence: false,
    };
  }

  if (group.suggestion && (group.confidence === "alta" || group.confidence === "media")) {
    return {
      status_final: "CLEARLY_CLASSIFIABLE",
      categoria_sugerida: group.suggestion,
      confianca: group.confidence,
      motivo: group.note,
      high_confidence: group.confidence === "alta" && group.quantity >= 3,
    };
  }

  if (categories.size === 1) {
    const cat = [...categories][0]!;
    const confidences = perProduct.map((p) => p.confidence);
    const altaCount = confidences.filter((c) => c === "alta").length;
    const conf: ReviewConfidence =
      altaCount >= names.length * 0.7 ? "alta" : altaCount > 0 ? "media" : "baixa";

    if (conf === "baixa" && group.quantity < 3) {
      return {
        status_final: "INSUFFICIENT",
        categoria_sugerida: cat,
        confianca: conf,
        motivo: perProduct[0]?.evidence ?? "Evidência fraca — grupo pequeno",
        high_confidence: false,
      };
    }

    return {
      status_final: "CLEARLY_CLASSIFIABLE",
      categoria_sugerida: cat,
      confianca: conf,
      motivo: perProduct.find((p) => p.suggestedCategory)?.evidence ?? "Evidência semântica consistente",
      high_confidence:
        conf === "alta" && !group.heterogeneous && group.quantity >= 3 && cat !== "Utilidades e Outros",
    };
  }

  const mostlyInsufficient = perProduct.filter((p) => p.families.has("insuficiente")).length;
  if (mostlyInsufficient >= names.length * 0.5 || allFamilies.has("insuficiente")) {
    return {
      status_final: "INSUFFICIENT",
      categoria_sugerida: null,
      confianca: "baixa",
      motivo: "Descrição genérica, código ou abreviação insuficiente",
      high_confidence: false,
    };
  }

  if (allFamilies.size === 1 && allFamilies.has("outro")) {
    return {
      status_final: "INSUFFICIENT",
      categoria_sugerida: null,
      confianca: "baixa",
      motivo: "Nome completo não fornece evidência semântica suficiente",
      high_confidence: false,
    };
  }

  return {
    status_final: "INSUFFICIENT",
    categoria_sugerida: null,
    confianca: "baixa",
    motivo: "Evidência insuficiente para classificação segura",
    high_confidence: false,
  };
}

function loadReady() {
  const buf = fs.readFileSync(FILE);
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]!]!;
  const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });
  const header = (matrix[0] ?? []).map((c) => cellValueToString(c));
  const resolved = resolveBeiraRioColumns(header);
  if (!resolved.ok) throw new Error("headers");
  const cols = resolved.columns;
  const getCell = (r: number, c: number) => {
    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
    return cell ? cellValueToString(cell.v, cell.w) : "";
  };
  const rows = [];
  for (let i = 1; i < matrix.length; i++) {
    const name = normalizeProductName(getCell(i, cols.name));
    const price = parseBrazilianPrice(getCell(i, cols.price));
    rows.push({
      rowNumber: i + 1,
      internalCode: normalizeIdentifier(getCell(i, cols.internalCode)),
      barcode: normalizeIdentifier(getCell(i, cols.barcode)),
      name,
      price: price.ok ? price.value : null,
    });
  }
  const { annotations } = annotateSpreadsheetDuplicates(rows);
  return rows.filter((r) => {
    const a = annotations.get(r.rowNumber);
    return a?.kind === "PRODUTO_UNICO" && a.keepForImport && r.price != null && r.name;
  });
}

function loadDecisions(): ManualReviewDecision[] {
  if (!fs.existsSync(DECISIONS_PATH)) return [];
  const raw = fs.readFileSync(DECISIONS_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return parsed.latest ?? parsed.decisions ?? [];
}

function main() {
  const ready = loadReady();
  const decisions = loadDecisions();
  const overlay = categoryOverlayFromDecisions(decisions);
  const decidedIds = new Set(decisions.map((d) => d.reviewId));

  let autoClassified = 0;
  const reviewRequiredIds = new Set<string>();
  const unclassified: ReviewProductRef[] = [];

  for (const r of ready) {
    const c = classifyProductName(r.name);
    const ref: ReviewProductRef = {
      reviewId: makeReviewId(r.name, r.internalCode, r.barcode),
      name: r.name,
      internalCode: r.internalCode,
      barcode: r.barcode,
      price: r.price,
    };
    if (overlay.has(ref.reviewId)) continue;
    if (decidedIds.has(ref.reviewId) && decisions.find((d) => d.reviewId === ref.reviewId)?.chosenCategory)
      continue;

    if (c.status === "CLASSIFIED" && c.categoryName) {
      autoClassified += 1;
    } else if (c.status === "REVIEW_REQUIRED") {
      reviewRequiredIds.add(ref.reviewId);
    } else if (c.status === "UNCLASSIFIED") {
      unclassified.push(ref);
    }
  }

  const byPrefix = new Map<string, ReviewProductRef[]>();
  for (const p of unclassified) {
    const prefix =
      p.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, " ")
        .trim()
        .split(/\s+/)[0] || "?";
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix)!.push(p);
  }

  const groups = prioritizeReviewGroups(
    [...byPrefix.entries()].map(([key, products]) => buildReviewGroup(key, products)),
  );

  type GroupAudit = {
    groupKey: string;
    quantidade: number;
    exemplos: string[];
    categoria_sugerida: CatalogCategoryName | null;
    confianca: ReviewConfidence;
    homogeneous: boolean;
    motivo: string;
    status_final: AuditStatus;
    high_confidence: boolean;
    priority_score: number;
  };

  const audited: GroupAudit[] = groups.map((g) => {
    const audit = auditGroup(g);
    const impactScore =
      g.quantity *
      (audit.status_final === "CLEARLY_CLASSIFIABLE" ? 3 : audit.status_final === "AMBIGUOUS" ? 1 : 0.5) *
      (audit.high_confidence ? 2 : audit.confianca === "alta" ? 1.5 : audit.confianca === "media" ? 1 : 0.5) *
      (g.heterogeneous ? 0.3 : 1);
    return {
      groupKey: g.groupKey,
      quantidade: g.quantity,
      exemplos: g.products.slice(0, 5).map((p) => p.name),
      categoria_sugerida: audit.categoria_sugerida,
      confianca: audit.confianca,
      homogeneous: !g.heterogeneous,
      motivo: audit.motivo,
      status_final: audit.status_final,
      high_confidence: audit.high_confidence,
      priority_score: impactScore,
    };
  });

  audited.sort((a, b) => {
    if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade;
    if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
    const statusOrder = { CLEARLY_CLASSIFIABLE: 0, AMBIGUOUS: 1, INSUFFICIENT: 2 };
    return statusOrder[a.status_final] - statusOrder[b.status_final];
  });

  let clearly = 0;
  let ambiguous = 0;
  let insufficient = 0;
  for (const g of audited) {
    if (g.status_final === "CLEARLY_CLASSIFIABLE") clearly += g.quantidade;
    else if (g.status_final === "AMBIGUOUS") ambiguous += g.quantidade;
    else insufficient += g.quantidade;
  }

  const highConfidenceCandidates = audited.filter(
    (g) => g.high_confidence && g.status_final === "CLEARLY_CLASSIFIABLE",
  );
  const highConfidenceProducts = highConfidenceCandidates.reduce((n, g) => n + g.quantidade, 0);

  const ambiguousGroups = audited.filter((g) => g.status_final === "AMBIGUOUS");
  const insufficientGroups = audited.filter((g) => g.status_final === "INSUFFICIENT");

  const pipeline = computePipelineAfterDecisions(
    {
      total: ready.length,
      autoClassified,
      autoReviewRequired: reviewRequiredIds.size,
      autoUnclassified: ready.length - autoClassified - reviewRequiredIds.size,
      pendingInitial: unclassified.length,
      classifiedWithManualBaseline: 0,
    },
    decisions,
    reviewRequiredIds,
  );

  const integrity = verifyPipelineIntegrity({ ...pipeline, total: ready.length });
  const catalogTotal = ready.length;
  const classified = pipeline.CLASSIFIED;
  const reviewRequired = pipeline.REVIEW_REQUIRED;
  const unclassifiedCount = pipeline.UNCLASSIFIED;

  const coverageCurrent = (classified / catalogTotal) * 100;
  const coveragePotential = ((classified + clearly) / catalogTotal) * 100;

  const sumCheck = clearly + ambiguous + insufficient;

  const report = {
    generated_at: new Date().toISOString(),
    phase: "FINAL_UNCLASSIFIED_AUDIT",
    note: "Somente análise — nenhuma classificação aplicada. Não altera classificador L0/L1/L2.",
    catalog_total: catalogTotal,
    classified,
    review_required: reviewRequired,
    unclassified: unclassifiedCount,
    groups_total: audited.length,
    clearly_classifiable: clearly,
    ambiguous,
    insufficient,
    sum_check: sumCheck,
    sum_valid: sumCheck === unclassifiedCount,
    maior_grupo: audited[0]
      ? { groupKey: audited[0].groupKey, quantidade: audited[0].quantidade }
      : null,
    top_10_groups: audited.slice(0, 10).map((g) => ({
      groupKey: g.groupKey,
      quantidade: g.quantidade,
      status_final: g.status_final,
      categoria_sugerida: g.categoria_sugerida,
    })),
    top_20_groups: audited.slice(0, 20),
    high_confidence_candidates: highConfidenceCandidates.map((g) => ({
      groupKey: g.groupKey,
      quantidade: g.quantidade,
      categoria_sugerida: g.categoria_sugerida,
      confianca: g.confianca,
      exemplos: g.exemplos,
      motivo: g.motivo,
    })),
    high_confidence_products: highConfidenceProducts,
    high_confidence_percent_of_unclassified:
      unclassifiedCount > 0
        ? ((highConfidenceProducts / unclassifiedCount) * 100).toFixed(2)
        : "0.00",
    clearly_classifiable_percent_of_unclassified:
      unclassifiedCount > 0 ? ((clearly / unclassifiedCount) * 100).toFixed(2) : "0.00",
    AMBIGUOS: ambiguousGroups.slice(0, 50).map((g) => ({
      groupKey: g.groupKey,
      quantidade: g.quantidade,
      motivo: g.motivo,
      exemplos: g.exemplos,
    })),
    INSUFFICIENT_DESCRIPTION: insufficientGroups.slice(0, 50).map((g) => ({
      groupKey: g.groupKey,
      quantidade: g.quantidade,
      motivo: g.motivo,
      exemplos: g.exemplos,
    })),
    CANDIDATOS_DE_ALTA_CONFIANCA: highConfidenceCandidates,
    coverage_current: coverageCurrent.toFixed(2),
    coverage_potential: coveragePotential.toFixed(2),
    coverage_current_detail: `${classified} / ${catalogTotal} = ${coverageCurrent.toFixed(2)}%`,
    coverage_potential_detail: `(${classified} + ${clearly}) / ${catalogTotal} = ${coveragePotential.toFixed(2)}% (estimativa)`,
    integrity,
    manual_decisions_count: decisions.length,
    system_state: {
      excel_original_alterado: false,
      hosted_alterado: false,
      produtos_importados: false,
      migration_aplicada: false,
      deploy: false,
      commit: false,
      push: false,
    },
    all_groups: audited,
  };

  if (!report.sum_valid) {
    console.error(
      `AVISO: clearly+ambiguous+insufficient (${sumCheck}) != unclassified (${unclassifiedCount})`,
    );
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main();
