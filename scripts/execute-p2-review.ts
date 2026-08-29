/**
 * Executa lote P2 da revisão manual Beira Rio — local only.
 * Escopo: UNCLASSIFIED pendentes, até 10 grupos ou 150 produtos.
 * Prioridade: tiers P1/P2 do mecanismo existente; grupos adicionais só com auditoria manual explícita.
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
  appendDecisionHistory,
  buildReviewGroup,
  canApproveGroup,
  computePipelineAfterDecisions,
  computeReviewProgress,
  createGroupApprovalDecisions,
  getGroupPriorityMeta,
  loadDecisionStore,
  makeReviewId,
  mergeDecisions,
  prioritizeReviewGroups,
  verifyPipelineIntegrity,
  type DecisionStore,
  type ManualReviewDecision,
  type ManualReviewGroup,
  type ReviewProductRef,
} from "../src/lib/productCategory/manualReview.ts";

const FILE = path.join("Lista de Produtos", "RELAÇÃO DE PRODUTOS - BEIRA RIO.xlsx");
const DECISIONS_PATH = path.join("scripts", "manual-review-decisions.json");
const REPORT_PATH = path.join("scripts", "p2-review-report.json");

const MAX_GROUPS = 10;
const MAX_PRODUCTS = 150;

/** Grupos auditados manualmente — evidência forte, homogeneidade verificada. Não vira regra L0/L1/L2. */
const MANUAL_AUDIT_GROUPS: Array<{
  groupKey: string;
  category: CatalogCategoryName;
  motivo: string;
  candidateForFutureRule?: boolean;
}> = [
  {
    groupKey: "TAMPICO",
    category: "Bebidas",
    motivo: "Todos são sucos/refrescos Tampico (bebida pronta)",
  },
  {
    groupKey: "TORRADA",
    category: "Padaria e Confeitaria",
    motivo: "Tostas Bauducco — produtos de padaria seca",
  },
  {
    groupKey: "TRIDENT",
    category: "Mercearia Seca e Básica",
    motivo: "Gomas de mascar Trident — mercearia",
  },
  {
    groupKey: "PAPINHA",
    category: "Mercearia Seca e Básica",
    motivo: "Papinhas infantis embaladas — mercearia",
  },
  {
    groupKey: "PROTEINA",
    category: "Mercearia Seca e Básica",
    motivo: "Proteína texturizada de soja — mercearia seca",
  },
  {
    groupKey: "NO",
    category: "Limpeza",
    motivo: "Linha 'NO AR' — aromatizadores/desodorizadores de ambiente (Bom Bril etc.)",
  },
  {
    groupKey: "ESTOPA",
    category: "Limpeza",
    motivo: "Estopas/flanelas para limpeza e polimento",
  },
  {
    groupKey: "SBP",
    category: "Limpeza",
    motivo: "Inseticidas/repelentes SBP — limpeza doméstica",
  },
  {
    groupKey: "GRANULADO",
    category: "Padaria e Confeitaria",
    motivo: "Granulados/confeitos coloridos para confeitaria",
  },
  {
    groupKey: "TORNEIRA",
    category: "Utilidades e Outros",
    motivo: "Torneiras e filtros de pia — utilidades domésticas",
  },
];

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

function loadExistingStore(): DecisionStore {
  if (!fs.existsSync(DECISIONS_PATH)) {
    return { latest: [], history: [] };
  }
  const raw = fs.readFileSync(DECISIONS_PATH, "utf8");
  const parsed = JSON.parse(raw) as DecisionStore & { decisions?: ManualReviewDecision[] };
  if (parsed.latest && parsed.history) {
    return { latest: parsed.latest, history: parsed.history };
  }
  if (parsed.decisions) {
    return { latest: parsed.decisions, history: parsed.decisions };
  }
  return loadDecisionStore(raw);
}

function buildGroupsFromUnclassified(unclassified: ReviewProductRef[]): ManualReviewGroup[] {
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
  return prioritizeReviewGroups(
    [...byPrefix.entries()].map(([key, products]) => buildReviewGroup(key, products)),
  );
}

function passesSafetyGate(group: ManualReviewGroup, minConfidence: "alta" | "media"): boolean {
  if (group.heterogeneous || !group.groupApprovalAllowed || !group.suggestion) return false;
  if (minConfidence === "alta") return group.confidence === "alta";
  return group.confidence === "alta" || group.confidence === "media";
}

function main() {
  const ready = loadReady();
  const store = loadExistingStore();
  const decidedBefore = new Set(store.latest.map((d) => d.reviewId));

  const autoByCat: Record<string, number> = Object.fromEntries(
    CATALOG_CATEGORY_NAMES.map((c) => [c, 0]),
  );
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
    if (c.status === "CLASSIFIED" && c.categoryName) {
      autoClassified += 1;
      autoByCat[c.categoryName] = (autoByCat[c.categoryName] ?? 0) + 1;
    } else if (c.status === "REVIEW_REQUIRED") {
      reviewRequiredIds.add(ref.reviewId);
    } else if (c.status === "UNCLASSIFIED") {
      if (!decidedBefore.has(ref.reviewId)) unclassified.push(ref);
    }
  }

  const allGroups = buildGroupsFromUnclassified(unclassified);
  const groupByKey = new Map(allGroups.map((g) => [g.groupKey, g]));

  const tierP1 = allGroups.filter((g) => getGroupPriorityMeta(g).tier === 1);
  const tierP2 = allGroups.filter((g) => getGroupPriorityMeta(g).tier === 2);
  const tierP12 = [...tierP1, ...tierP2].sort(
    (a, b) => getGroupPriorityMeta(b).score - getGroupPriorityMeta(a).score,
  );

  type GroupReport = {
    groupKey: string;
    quantity: number;
    tier: number;
    score: number;
    confidence: string;
    suggestion: string | null;
    categoryApplied: string | null;
    action: string;
    productsAffected: number;
    source: "tier_p1_p2" | "manual_audit";
    examples: string[];
    reason?: string;
    candidateForFutureRule?: boolean;
  };

  const groupReports: GroupReport[] = [];
  let newDecisions: ManualReviewDecision[] = [];
  let groupsAnalyzed = 0;
  let groupsApproved = 0;
  let groupsHeterogeneous = 0;
  let groupApprovals = 0;
  let productsProcessed = 0;

  const processGroup = (
    group: ManualReviewGroup,
    category: CatalogCategoryName,
    source: "tier_p1_p2" | "manual_audit",
    observation: string,
    candidateForFutureRule?: boolean,
  ): boolean => {
    groupsAnalyzed += 1;
    const meta = getGroupPriorityMeta(group);
    const pendingProducts = group.products.filter((p) => !decidedBefore.has(p.reviewId));

    if (pendingProducts.length === 0) {
      groupReports.push({
        groupKey: group.groupKey,
        quantity: group.quantity,
        tier: meta.tier,
        score: meta.score,
        confidence: group.confidence,
        suggestion: group.suggestion,
        categoryApplied: category,
        action: "ALREADY_REVIEWED",
        productsAffected: 0,
        source,
        examples: group.products.slice(0, 3).map((p) => p.name),
        reason: "Produtos já tinham decisão",
      });
      return false;
    }

    if (productsProcessed >= MAX_PRODUCTS) {
      groupReports.push({
        groupKey: group.groupKey,
        quantity: group.quantity,
        tier: meta.tier,
        score: meta.score,
        confidence: group.confidence,
        suggestion: group.suggestion,
        categoryApplied: category,
        action: "SKIPPED_LIMIT",
        productsAffected: 0,
        source,
        examples: pendingProducts.slice(0, 3).map((p) => p.name),
        reason: `Limite de ${MAX_PRODUCTS} produtos atingido`,
      });
      return false;
    }

    const gate = canApproveGroup(group);
    if (source === "tier_p1_p2" && !passesSafetyGate(group, meta.tier === 1 ? "alta" : "media")) {
      groupsHeterogeneous += 1;
      groupReports.push({
        groupKey: group.groupKey,
        quantity: group.quantity,
        tier: meta.tier,
        score: meta.score,
        confidence: group.confidence,
        suggestion: group.suggestion,
        categoryApplied: null,
        action: "BLOCKED",
        productsAffected: 0,
        source,
        examples: pendingProducts.slice(0, 3).map((p) => p.name),
        reason: gate.message ?? "Filtro de segurança não passou",
      });
      return false;
    }

    const partialGroup: ManualReviewGroup = {
      ...group,
      products: pendingProducts,
      quantity: pendingProducts.length,
      suggestion: category,
      groupApprovalAllowed: true,
      heterogeneous: false,
    };

    const remaining = MAX_PRODUCTS - productsProcessed;
    const toApprove =
      pendingProducts.length <= remaining
        ? pendingProducts
        : pendingProducts.slice(0, remaining);
    const partialLimited: ManualReviewGroup = {
      ...partialGroup,
      products: toApprove,
      quantity: toApprove.length,
    };

    try {
      const batch = createGroupApprovalDecisions(
        partialLimited,
        category,
        undefined,
        observation,
      );
      newDecisions = mergeDecisions(newDecisions, batch);
      groupApprovals += batch.length;
      productsProcessed += batch.length;
      groupsApproved += 1;
      for (const d of batch) decidedBefore.add(d.reviewId);

      groupReports.push({
        groupKey: group.groupKey,
        quantity: group.quantity,
        tier: meta.tier,
        score: meta.score,
        confidence: group.confidence,
        suggestion: group.suggestion,
        categoryApplied: category,
        action: "GROUP_APPROVAL",
        productsAffected: batch.length,
        source,
        examples: batch.slice(0, 5).map((d) => d.productName),
        candidateForFutureRule,
      });
      return true;
    } catch (err) {
      groupsHeterogeneous += 1;
      groupReports.push({
        groupKey: group.groupKey,
        quantity: group.quantity,
        tier: meta.tier,
        score: meta.score,
        confidence: group.confidence,
        suggestion: group.suggestion,
        categoryApplied: null,
        action: "ERROR",
        productsAffected: 0,
        source,
        examples: pendingProducts.slice(0, 3).map((p) => p.name),
        reason: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  };

  // 1) Tiers P1/P2 do mecanismo existente
  for (const group of tierP12) {
    if (groupsApproved >= MAX_GROUPS || productsProcessed >= MAX_PRODUCTS) break;
    if (!group.suggestion) continue;
    processGroup(
      group,
      group.suggestion,
      "tier_p1_p2",
      `P2 batch — tier P${getGroupPriorityMeta(group).tier} ${group.groupKey}`,
    );
  }

  // 2) Auditoria manual conservadora (grupos grandes homogêneos não capturados pelo tier)
  for (const audit of MANUAL_AUDIT_GROUPS) {
    if (groupsApproved >= MAX_GROUPS || productsProcessed >= MAX_PRODUCTS) break;
    const group = groupByKey.get(audit.groupKey);
    if (!group) {
      groupReports.push({
        groupKey: audit.groupKey,
        quantity: 0,
        tier: 0,
        score: 0,
        confidence: "n/a",
        suggestion: null,
        categoryApplied: audit.category,
        action: "NOT_FOUND",
        productsAffected: 0,
        source: "manual_audit",
        examples: [],
        reason: "Grupo não encontrado entre UNCLASSIFIED pendentes",
      });
      continue;
    }
    if (group.heterogeneous) {
      groupsHeterogeneous += 1;
      groupsAnalyzed += 1;
      groupReports.push({
        groupKey: group.groupKey,
        quantity: group.quantity,
        tier: getGroupPriorityMeta(group).tier,
        score: getGroupPriorityMeta(group).score,
        confidence: group.confidence,
        suggestion: group.suggestion,
        categoryApplied: null,
        action: "BLOCKED_HETEROGENEOUS",
        productsAffected: 0,
        source: "manual_audit",
        examples: group.products.slice(0, 3).map((p) => p.name),
        reason: group.heterogeneityReason ?? "Grupo heterogêneo",
      });
      continue;
    }
    processGroup(
      group,
      audit.category,
      "manual_audit",
      `P2 manual audit — ${audit.groupKey}: ${audit.motivo}`,
      audit.candidateForFutureRule,
    );
  }

  const updatedStore: DecisionStore = {
    latest: mergeDecisions(store.latest, newDecisions),
    history: appendDecisionHistory(store.history, newDecisions),
  };

  const manualByCat: Record<string, number> = Object.fromEntries(
    CATALOG_CATEGORY_NAMES.map((c) => [c, 0]),
  );
  for (const d of updatedStore.latest) {
    if (d.chosenCategory) manualByCat[d.chosenCategory] = (manualByCat[d.chosenCategory] ?? 0) + 1;
  }

  const finalByCat: Record<string, number> = { ...autoByCat };
  for (const c of CATALOG_CATEGORY_NAMES) {
    finalByCat[c] = (autoByCat[c] ?? 0) + (manualByCat[c] ?? 0);
  }

  const residualCount = unclassified.length;
  const pipelineBefore = computePipelineAfterDecisions(
    {
      total: ready.length,
      autoClassified,
      autoReviewRequired: reviewRequiredIds.size,
      autoUnclassified: ready.length - autoClassified - reviewRequiredIds.size,
      pendingInitial: residualCount,
      classifiedWithManualBaseline: 0,
    },
    store.latest,
    reviewRequiredIds,
  );

  const pipeline = computePipelineAfterDecisions(
    {
      total: ready.length,
      autoClassified,
      autoReviewRequired: reviewRequiredIds.size,
      autoUnclassified: ready.length - autoClassified - reviewRequiredIds.size,
      pendingInitial: residualCount,
      classifiedWithManualBaseline: 0,
    },
    updatedStore.latest,
    reviewRequiredIds,
  );

  const integrity = verifyPipelineIntegrity({ ...pipeline, total: ready.length });
  const progress = computeReviewProgress(allGroups, updatedStore.latest, residualCount);

  const report = {
    executed_at: new Date().toISOString(),
    phase: "P2",
    limits: { max_groups: MAX_GROUPS, max_products: MAX_PRODUCTS },
    before: {
      CLASSIFIED: pipelineBefore.CLASSIFIED,
      REVIEW_REQUIRED: pipelineBefore.REVIEW_REQUIRED,
      UNCLASSIFIED: pipelineBefore.UNCLASSIFIED,
      decisions_count: store.latest.length,
    },
    after: {
      CLASSIFIED: pipeline.CLASSIFIED,
      REVIEW_REQUIRED: pipeline.REVIEW_REQUIRED,
      UNCLASSIFIED: pipeline.UNCLASSIFIED,
      decisions_count: updatedStore.latest.length,
      pending: progress.productsRemaining,
    },
    p2: {
      tier_p1_groups_available: tierP1.length,
      tier_p2_groups_available: tierP2.length,
      groups_analyzed: groupsAnalyzed,
      groups_approved_collectively: groupsApproved,
      groups_heterogeneous_or_blocked: groupsHeterogeneous,
      products_reclassified_this_run: newDecisions.length,
      group_approvals: groupApprovals,
      individual_decisions: 0,
      kept_unclassified: 0,
      pending_unclassified: pipeline.UNCLASSIFIED,
      groups: groupReports,
    },
    coverage_percent: ((pipeline.CLASSIFIED / ready.length) * 100).toFixed(2),
    byCat: finalByCat,
    pipeline,
    integrity,
    new_decisions_sample: newDecisions.slice(0, 15),
  };

  fs.writeFileSync(
    DECISIONS_PATH,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        source: "assisted_manual_review_local",
        note: "Decisões locais auditáveis. P2 batch incluído. Não são regras L0/L1/L2.",
        stats: progress,
        latest: updatedStore.latest,
        history: updatedStore.history,
      },
      null,
      2,
    ),
    "utf8",
  );

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  const finalReportPath = path.join("scripts", "classification-final-report.json");
  let prev: Record<string, unknown> = {};
  if (fs.existsSync(finalReportPath)) {
    prev = JSON.parse(fs.readFileSync(finalReportPath, "utf8"));
  }
  fs.writeFileSync(
    finalReportPath,
    JSON.stringify(
      {
        ...prev,
        counts: pipeline,
        byCat: finalByCat,
        sum_check: integrity.sum,
        p2_review: report.p2,
        manual_review_decisions: updatedStore.latest.length,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(JSON.stringify(report, null, 2));
}

main();
