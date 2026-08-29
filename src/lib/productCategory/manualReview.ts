/**
 * Revisão manual assistida — decisões locais auditáveis.
 * Não altera o classificador automático nem o Hosted.
 */

import {
  CATALOG_CATEGORY_NAMES,
  type CatalogCategoryName,
} from "./classifyProduct";

export type ManualDecisionType =
  | "GROUP_APPROVAL"
  | "INDIVIDUAL"
  | "KEPT_UNCLASSIFIED";

export type ReviewConfidence = "alta" | "media" | "baixa" | "nenhuma";

export interface ReviewProductRef {
  /** Identificador estável local (não é UUID do Hosted). */
  reviewId: string;
  name: string;
  internalCode?: string | null;
  barcode?: string | null;
  price?: number | null;
}

export interface ManualReviewGroup {
  groupKey: string;
  quantity: number;
  products: ReviewProductRef[];
  suggestion: CatalogCategoryName | null;
  confidence: ReviewConfidence;
  note: string;
  heterogeneous: boolean;
  groupApprovalAllowed: boolean;
  heterogeneityReason?: string;
}

export interface ManualReviewDecision {
  reviewId: string;
  productName: string;
  decisionType: ManualDecisionType;
  suggestedCategory: CatalogCategoryName | null;
  chosenCategory: CatalogCategoryName | null;
  groupKey: string;
  timestamp: string;
  /** Justificativa administrativa opcional */
  observation?: string;
}

export type ReviewPriorityTier = 1 | 2 | 3 | 4;

export type GroupReviewStatus = "pending" | "partial" | "reviewed";

export type ReviewGroupFilter =
  | "all"
  | "alta"
  | "media"
  | "baixa"
  | "homogeneous"
  | "heterogeneous"
  | "large_quantity"
  | "pending"
  | "reviewed";

export interface GroupPriorityMeta {
  tier: ReviewPriorityTier;
  score: number;
  label: string;
}

export interface ReviewRequiredItem extends ReviewProductRef {
  reason: string;
  candidates: Array<{ categoryName: CatalogCategoryName; score: number }>;
  suggestedCategory: CatalogCategoryName | null;
  confidence: ReviewConfidence;
}

export interface CatalogBaseline {
  total: number;
  autoClassified: number;
  autoReviewRequired: number;
  autoUnclassified: number;
  pendingInitial: number;
  classifiedWithManualBaseline: number;
}

export interface ReviewProgressStats extends ManualReviewStats {
  pendingInitial: number;
  progressPercent: number;
  productsRemaining: number;
  groupsPending: number;
  groupsHeterogeneous: number;
  groupsApproved: number;
}

export interface DecisionStore {
  /** Última decisão por produto (para exibição). */
  latest: ManualReviewDecision[];
  /** Histórico completo append-only. */
  history: ManualReviewDecision[];
}

export interface ManualReviewStats {
  groupsAvailable: number;
  groupsReviewed: number;
  productsReviewed: number;
  approvedByGroup: number;
  classifiedIndividually: number;
  keptUnclassified: number;
  pending: number;
}

export function isCatalogCategoryName(value: string): value is CatalogCategoryName {
  return (CATALOG_CATEGORY_NAMES as readonly string[]).includes(value);
}

/**
 * Detecta se nomes do mesmo grupo sugerem categorias distintas.
 * Heurística conservadora: se ≥2 famílias semânticas claras → heterogêneo.
 */
export function assessGroupHomogeneity(
  productNames: string[],
): {
  heterogeneous: boolean;
  reason?: string;
  suggestion: CatalogCategoryName | null;
  confidence: ReviewConfidence;
  note: string;
} {
  const families = new Set<string>();
  const normalized = productNames.map((n) =>
    n
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase(),
  );

  for (const n of normalized) {
    if (/PINHO\s+BRIL|PINHO\s+TROP|DESINFET|LIMPA|LIMPADOR/.test(n)) families.add("limpeza");
    else if (
      /CORPO A CORPO|HIDRAT|SHAMPOO|CONDIC|SABONETE|CREME|CR\.\s*HID|UMIDIFIC|UMIDILIZ|ALISAN|RESTAUR|GUANI|NATU HAIR/.test(
        n,
      )
    )
      families.add("higiene");
    else if (/CORPO E SABOR|CHOCOLATE|CHOC\.|BISCOITO|COOK/.test(n)) families.add("mercearia_doce");
    else if (/\bMARG\b|MARGARINA|DELICIA|QUALY|DORIANA|PRIMOR/.test(n) && /MARG/.test(n))
      families.add("frios_marg");
    else if (/FEIJOADA/.test(n)) families.add("feijoada");
    else if (/VINHO|CABERNET|SAUVIGNON|750ML/.test(n) && /NINHO|AFFANI/.test(n))
      families.add("bebida");
    else if (/NINHO|LEITE|LEPO|LACT|FORT/.test(n)) families.add("lacteo_ninho");
    else if (/KIT\s+(CHOC|FACIL|KAT)/.test(n) || /YOKI|NESTLE.*KIT/.test(n)) families.add("kit_alimento");
    else if (/KIT\s+(HIDR|NIELY|SENADOR|SUISSA|GB)|SABONETEIRA|DESOD/.test(n))
      families.add("kit_higiene");
    else if (/KIT\s+(FORT|PIA|PRATICE|ELETR)/.test(n)) families.add("kit_util");
    else if (/SOPAO|SOPA\b/.test(n)) families.add("mercearia");
    else families.add("outro");
  }

  if (families.size >= 2) {
    return {
      heterogeneous: true,
      reason: `Famílias distintas detectadas: ${[...families].join(", ")}`,
      suggestion: null,
      confidence: "nenhuma",
      note: "Grupo heterogêneo — classificação coletiva indisponível",
    };
  }

  const only = [...families][0] ?? "outro";
  if (only === "limpeza") {
    return {
      heterogeneous: false,
      suggestion: "Limpeza",
      confidence: "alta",
      note: "Produtos identificados como limpeza doméstica",
    };
  }
  if (only === "higiene") {
    return {
      heterogeneous: false,
      suggestion: "Higiene Pessoal",
      confidence: "alta",
      note: "Produtos identificados como higiene / cosmético",
    };
  }
  if (only === "frios_marg") {
    return {
      heterogeneous: false,
      suggestion: "Frios e Laticínios",
      confidence: "alta",
      note: "Margarinas / similar — decisão comercial Frios e Laticínios",
    };
  }
  if (only === "feijoada") {
    return {
      heterogeneous: false,
      suggestion: "Mercearia Seca e Básica",
      confidence: "media",
      note: "Feijoada enlatada — sugerida Mercearia (revisar se preferir Frios)",
    };
  }
  if (only === "mercearia" || only === "mercearia_doce" || only === "lacteo_ninho") {
    return {
      heterogeneous: false,
      suggestion: "Mercearia Seca e Básica",
      confidence: "media",
      note: "Padrão alimentar seco / mercearia",
    };
  }

  return {
    heterogeneous: false,
    suggestion: null,
    confidence: "baixa",
    note: "Requer decisão manual / comercial",
  };
}

export function buildReviewGroup(
  groupKey: string,
  products: ReviewProductRef[],
): ManualReviewGroup {
  const assessment = assessGroupHomogeneity(products.map((p) => p.name));
  return {
    groupKey,
    quantity: products.length,
    products,
    suggestion: assessment.suggestion,
    confidence: assessment.confidence,
    note: assessment.note,
    heterogeneous: assessment.heterogeneous,
    groupApprovalAllowed: !assessment.heterogeneous && assessment.suggestion != null,
    heterogeneityReason: assessment.reason,
  };
}

export function sortReviewGroups(groups: ManualReviewGroup[]): ManualReviewGroup[] {
  return prioritizeReviewGroups(groups);
}

const CONF_WEIGHT: Record<ReviewConfidence, number> = {
  alta: 3,
  media: 2,
  baixa: 1,
  nenhuma: 0.5,
};

/** score = quantidade × peso_confiança × fator_ambiguidade */
export function computeGroupPriorityScore(group: ManualReviewGroup): number {
  let ambiguity = 1;
  if (group.heterogeneous) ambiguity = 0.3;
  else if (group.confidence === "nenhuma" || group.confidence === "baixa") ambiguity = 0.5;
  else if (group.confidence === "media") ambiguity = 0.9;
  return group.quantity * CONF_WEIGHT[group.confidence] * ambiguity;
}

export function computePriorityTier(group: ManualReviewGroup): ReviewPriorityTier {
  if (group.heterogeneous || group.confidence === "nenhuma" || group.confidence === "baixa") {
    return 4;
  }
  if (group.confidence === "alta" && group.quantity >= 5 && group.suggestion) return 1;
  if (group.confidence === "media" && group.quantity >= 5 && group.suggestion) return 2;
  if (group.confidence === "alta" && group.suggestion) return 3;
  return 4;
}

export function getGroupPriorityMeta(group: ManualReviewGroup): GroupPriorityMeta {
  const tier = computePriorityTier(group);
  const labels: Record<ReviewPriorityTier, string> = {
    1: "P1 — grande + alta confiança",
    2: "P2 — grande + confiança média",
    3: "P3 — pequeno + alta confiança",
    4: "P4 — ambíguo / heterogêneo",
  };
  return { tier, score: computeGroupPriorityScore(group), label: labels[tier] };
}

export function prioritizeReviewGroups(groups: ManualReviewGroup[]): ManualReviewGroup[] {
  return [...groups].sort((a, b) => {
    const pa = getGroupPriorityMeta(a);
    const pb = getGroupPriorityMeta(b);
    if (pa.tier !== pb.tier) return pa.tier - pb.tier;
    if (pb.score !== pa.score) return pb.score - pa.score;
    return b.quantity - a.quantity;
  });
}

export function getGroupReviewStatus(
  group: ManualReviewGroup,
  decidedIds: Set<string>,
): GroupReviewStatus {
  const decided = group.products.filter((p) => decidedIds.has(p.reviewId)).length;
  if (decided === 0) return "pending";
  if (decided >= group.products.length) return "reviewed";
  return "partial";
}

export function filterReviewGroups(
  groups: ManualReviewGroup[],
  filter: ReviewGroupFilter,
  decidedIds: Set<string>,
): ManualReviewGroup[] {
  if (filter === "all") return groups;
  return groups.filter((g) => {
    switch (filter) {
      case "alta":
        return g.confidence === "alta";
      case "media":
        return g.confidence === "media";
      case "baixa":
        return g.confidence === "baixa" || g.confidence === "nenhuma";
      case "homogeneous":
        return !g.heterogeneous;
      case "heterogeneous":
        return g.heterogeneous;
      case "large_quantity":
        return g.quantity >= 8;
      case "pending":
        return getGroupReviewStatus(g, decidedIds) === "pending";
      case "reviewed":
        return getGroupReviewStatus(g, decidedIds) === "reviewed";
      default:
        return true;
    }
  });
}

export function searchReviewGroups(
  groups: ManualReviewGroup[],
  query: string,
): ManualReviewGroup[] {
  const q = query.trim().toUpperCase();
  if (!q) return groups;
  return groups.filter((g) => {
    if (g.groupKey.includes(q)) return true;
    return g.products.some((p) => {
      const hay = [
        p.name,
        p.internalCode ?? "",
        p.barcode ?? "",
        p.reviewId,
      ]
        .join(" ")
        .toUpperCase();
      return hay.includes(q);
    });
  });
}

export function computeReviewProgress(
  groups: ManualReviewGroup[],
  decisions: ManualReviewDecision[],
  pendingInitial: number,
): ReviewProgressStats {
  const base = computeReviewStats(groups, decisions);
  const decidedIds = new Set(decisions.map((d) => d.reviewId));
  const groupsPending = groups.filter(
    (g) => getGroupReviewStatus(g, decidedIds) !== "reviewed",
  ).length;
  const groupsHeterogeneous = groups.filter((g) => g.heterogeneous).length;
  const groupsApproved = new Set(
    decisions.filter((d) => d.decisionType === "GROUP_APPROVAL").map((d) => d.groupKey),
  ).size;

  const productsRemaining = Math.max(0, pendingInitial - base.productsReviewed);
  const progressPercent =
    pendingInitial > 0 ? (base.productsReviewed / pendingInitial) * 100 : 100;

  return {
    ...base,
    pendingInitial,
    progressPercent,
    productsRemaining,
    groupsPending,
    groupsHeterogeneous,
    groupsApproved,
  };
}

export function verifyPipelineIntegrity(counts: {
  CLASSIFIED: number;
  REVIEW_REQUIRED: number;
  UNCLASSIFIED: number;
  total?: number;
}): { ok: boolean; sum: number; expected: number } {
  const expected = counts.total ?? 19_268;
  const sum = counts.CLASSIFIED + counts.REVIEW_REQUIRED + counts.UNCLASSIFIED;
  return { ok: sum === expected, sum, expected };
}

export function computePipelineAfterDecisions(
  baseline: CatalogBaseline,
  decisions: ManualReviewDecision[],
  reviewRequiredIds: Set<string>,
): { CLASSIFIED: number; REVIEW_REQUIRED: number; UNCLASSIFIED: number } {
  const overlay = categoryOverlayFromDecisions(decisions);
  const manualClassified = overlay.size;
  const classified = baseline.autoClassified + manualClassified;
  const reviewLeft = [...reviewRequiredIds].filter((id) => !overlay.has(id)).length;
  const unclassified = baseline.total - classified - reviewLeft;
  return { CLASSIFIED: classified, REVIEW_REQUIRED: reviewLeft, UNCLASSIFIED: unclassified };
}

export function canApproveGroup(group: ManualReviewGroup): {
  ok: boolean;
  message?: string;
} {
  if (group.heterogeneous || !group.groupApprovalAllowed) {
    return {
      ok: false,
      message:
        "⚠ Grupo heterogêneo\n\nA classificação em grupo não está disponível.\nRevise os produtos individualmente.",
    };
  }
  if (!group.suggestion) {
    return {
      ok: false,
      message: "Sem sugestão segura para aprovação coletiva.",
    };
  }
  return { ok: true };
}

export function createGroupApprovalDecisions(
  group: ManualReviewGroup,
  category: CatalogCategoryName,
  selectedReviewIds?: string[],
  observation?: string,
  now = () => new Date().toISOString(),
): ManualReviewDecision[] {
  const gate = canApproveGroup(group);
  if (!gate.ok) {
    throw new Error(gate.message ?? "Aprovação de grupo bloqueada");
  }
  if (!isCatalogCategoryName(category)) {
    throw new Error("Categoria inválida");
  }
  const targets = selectedReviewIds?.length
    ? group.products.filter((p) => selectedReviewIds.includes(p.reviewId))
    : group.products;
  const ts = now();
  return targets.map((p) => ({
    reviewId: p.reviewId,
    productName: p.name,
    decisionType: "GROUP_APPROVAL" as const,
    suggestedCategory: group.suggestion,
    chosenCategory: category,
    groupKey: group.groupKey,
    timestamp: ts,
    observation,
  }));
}

export function createIndividualDecision(
  product: ReviewProductRef,
  groupKey: string,
  suggestedCategory: CatalogCategoryName | null,
  chosenCategory: CatalogCategoryName,
  observation?: string,
  now = () => new Date().toISOString(),
): ManualReviewDecision {
  if (!isCatalogCategoryName(chosenCategory)) {
    throw new Error("Categoria inválida");
  }
  return {
    reviewId: product.reviewId,
    productName: product.name,
    decisionType: "INDIVIDUAL",
    suggestedCategory,
    chosenCategory,
    groupKey,
    timestamp: now(),
    observation,
  };
}

export function createKeepUnclassifiedDecision(
  product: ReviewProductRef,
  groupKey: string,
  suggestedCategory: CatalogCategoryName | null,
  observation?: string,
  now = () => new Date().toISOString(),
): ManualReviewDecision {
  return {
    reviewId: product.reviewId,
    productName: product.name,
    decisionType: "KEPT_UNCLASSIFIED",
    suggestedCategory,
    chosenCategory: null,
    groupKey,
    timestamp: now(),
    observation,
  };
}

/** Última decisão por reviewId vence. */
export function mergeDecisions(
  existing: ManualReviewDecision[],
  incoming: ManualReviewDecision[],
): ManualReviewDecision[] {
  const map = new Map<string, ManualReviewDecision>();
  for (const d of existing) map.set(d.reviewId, d);
  for (const d of incoming) map.set(d.reviewId, d);
  return [...map.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/** Append-only — preserva histórico completo. */
export function appendDecisionHistory(
  history: ManualReviewDecision[],
  incoming: ManualReviewDecision[],
): ManualReviewDecision[] {
  return [...history, ...incoming].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function loadDecisionStore(raw: string | null): DecisionStore {
  if (!raw) return { latest: [], history: [] };
  try {
    const parsed = JSON.parse(raw) as DecisionStore | ManualReviewDecision[];
    if (Array.isArray(parsed)) {
      return { latest: parsed, history: [...parsed] };
    }
    return {
      latest: parsed.latest ?? [],
      history: parsed.history ?? parsed.latest ?? [],
    };
  } catch {
    return { latest: [], history: [] };
  }
}

export function saveDecisionStore(store: DecisionStore): string {
  return JSON.stringify(store);
}

export function applyDecisionBatch(
  store: DecisionStore,
  incoming: ManualReviewDecision[],
): DecisionStore {
  return {
    latest: mergeDecisions(store.latest, incoming),
    history: appendDecisionHistory(store.history, incoming),
  };
}

export function computeReviewStats(
  groups: ManualReviewGroup[],
  decisions: ManualReviewDecision[],
): ManualReviewStats {
  const totalProducts = groups.reduce((n, g) => n + g.products.length, 0);
  const byId = new Map(decisions.map((d) => [d.reviewId, d]));
  const reviewedIds = new Set(byId.keys());
  const groupsReviewed = groups.filter((g) =>
    g.products.some((p) => reviewedIds.has(p.reviewId)),
  ).length;

  let approvedByGroup = 0;
  let classifiedIndividually = 0;
  let keptUnclassified = 0;
  for (const d of byId.values()) {
    if (d.decisionType === "GROUP_APPROVAL" && d.chosenCategory) approvedByGroup += 1;
    else if (d.decisionType === "INDIVIDUAL" && d.chosenCategory) classifiedIndividually += 1;
    else if (d.decisionType === "KEPT_UNCLASSIFIED") keptUnclassified += 1;
  }

  return {
    groupsAvailable: groups.length,
    groupsReviewed,
    productsReviewed: reviewedIds.size,
    approvedByGroup,
    classifiedIndividually,
    keptUnclassified,
    pending: Math.max(0, totalProducts - reviewedIds.size),
  };
}

export function categoryOverlayFromDecisions(
  decisions: ManualReviewDecision[],
): Map<string, CatalogCategoryName> {
  const map = new Map<string, CatalogCategoryName>();
  for (const d of decisions) {
    if (d.chosenCategory) map.set(d.reviewId, d.chosenCategory);
  }
  return map;
}

export function makeReviewId(name: string, internalCode?: string | null, barcode?: string | null): string {
  const parts = [internalCode ?? "", barcode ?? "", name].map((s) =>
    String(s).trim().toUpperCase().replace(/\s+/g, " "),
  );
  return parts.join("|");
}
