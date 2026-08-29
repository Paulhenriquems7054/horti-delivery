/**
 * Executa revisão P1 do catálogo Beira Rio — local only.
 * Aprovação coletiva só para grupos P1 homogêneos com sugestão clara.
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
  applyDecisionBatch,
  buildReviewGroup,
  canApproveGroup,
  categoryOverlayFromDecisions,
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
const REPORT_PATH = path.join("scripts", "p1-review-report.json");

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

function buildGroupsFromResidual(residual: ReviewProductRef[]): ManualReviewGroup[] {
  const byPrefix = new Map<string, ReviewProductRef[]>();
  for (const p of residual) {
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

function main() {
  const ready = loadReady();
  const store = loadExistingStore();
  const decidedBefore = new Set(store.latest.map((d) => d.reviewId));

  const autoByCat: Record<string, number> = Object.fromEntries(
    CATALOG_CATEGORY_NAMES.map((c) => [c, 0]),
  );
  let autoClassified = 0;
  const reviewRequiredIds = new Set<string>();
  const residual: ReviewProductRef[] = [];

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
    } else {
      if (c.status === "REVIEW_REQUIRED") reviewRequiredIds.add(ref.reviewId);
      residual.push(ref);
    }
  }

  const allGroups = buildGroupsFromResidual(residual);
  const p1Groups = allGroups
    .filter((g) => getGroupPriorityMeta(g).tier === 1)
    .sort((a, b) => getGroupPriorityMeta(b).score - getGroupPriorityMeta(a).score);

  const p1Report: Array<{
    groupKey: string;
    quantity: number;
    suggestion: string | null;
    action: string;
    productsAffected: number;
    examples: string[];
    reason?: string;
  }> = [];

  let newDecisions: ManualReviewDecision[] = [];
  let groupApprovals = 0;
  let skippedAlreadyDone = 0;
  let blockedHeterogeneous = 0;

  for (const group of p1Groups) {
    const pendingProducts = group.products.filter((p) => !decidedBefore.has(p.reviewId));
    const alreadyDone = group.products.length - pendingProducts.length;

    if (pendingProducts.length === 0) {
      p1Report.push({
        groupKey: group.groupKey,
        quantity: group.quantity,
        suggestion: group.suggestion,
        action: "ALREADY_REVIEWED",
        productsAffected: 0,
        examples: group.products.slice(0, 3).map((p) => p.name),
        reason: `${alreadyDone} produto(s) já tinham decisão`,
      });
      skippedAlreadyDone += group.products.length;
      continue;
    }

    const gate = canApproveGroup(group);
    if (!gate.ok || !group.suggestion) {
      blockedHeterogeneous += 1;
      p1Report.push({
        groupKey: group.groupKey,
        quantity: group.quantity,
        suggestion: group.suggestion,
        action: "BLOCKED",
        productsAffected: 0,
        examples: pendingProducts.slice(0, 3).map((p) => p.name),
        reason: gate.message ?? group.heterogeneityReason ?? "Sem sugestão segura",
      });
      continue;
    }

    const partialGroup: ManualReviewGroup = {
      ...group,
      products: pendingProducts,
      quantity: pendingProducts.length,
    };

    try {
      const batch = createGroupApprovalDecisions(
        partialGroup,
        group.suggestion,
        undefined,
        `P1 batch review — ${group.groupKey}`,
      );
      newDecisions = mergeDecisions(newDecisions, batch);
      groupApprovals += batch.length;
      for (const d of batch) decidedBefore.add(d.reviewId);

      p1Report.push({
        groupKey: group.groupKey,
        quantity: group.quantity,
        suggestion: group.suggestion,
        action: "GROUP_APPROVAL",
        productsAffected: batch.length,
        examples: batch.slice(0, 5).map((d) => d.productName),
      });
    } catch (err) {
      p1Report.push({
        groupKey: group.groupKey,
        quantity: group.quantity,
        suggestion: group.suggestion,
        action: "ERROR",
        productsAffected: 0,
        examples: pendingProducts.slice(0, 3).map((p) => p.name),
        reason: err instanceof Error ? err.message : String(err),
      });
    }
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

  const pipeline = computePipelineAfterDecisions(
    {
      total: ready.length,
      autoClassified,
      autoReviewRequired: reviewRequiredIds.size,
      autoUnclassified: residual.length - reviewRequiredIds.size,
      pendingInitial: residual.length,
      classifiedWithManualBaseline: 0,
    },
    updatedStore.latest,
    reviewRequiredIds,
  );

  const integrity = verifyPipelineIntegrity({ ...pipeline, total: ready.length });
  const progress = computeReviewProgress(allGroups, updatedStore.latest, residual.length);

  const p1ReviewedCount = p1Report.filter(
    (r) => r.action === "GROUP_APPROVAL" || r.action === "ALREADY_REVIEWED",
  ).length;

  const report = {
    executed_at: new Date().toISOString(),
    phase: "P1",
    before: {
      CLASSIFIED: 16_052,
      REVIEW_REQUIRED: 8,
      UNCLASSIFIED: 3_208,
      pending: 3_216,
      decisions_count: store.latest.length,
    },
    after: {
      CLASSIFIED: pipeline.CLASSIFIED,
      REVIEW_REQUIRED: pipeline.REVIEW_REQUIRED,
      UNCLASSIFIED: pipeline.UNCLASSIFIED,
      pending: progress.productsRemaining,
      decisions_count: updatedStore.latest.length,
    },
    p1: {
      groups_found: p1Groups.length,
      groups_reviewed: p1ReviewedCount,
      products_reclassified_this_run: newDecisions.length,
      group_approvals: groupApprovals,
      individual_decisions: 0,
      kept_unclassified: updatedStore.latest.filter((d) => d.decisionType === "KEPT_UNCLASSIFIED")
        .length,
      pending: progress.productsRemaining,
      groups: p1Report,
    },
    byCat: finalByCat,
    pipeline,
    integrity,
    new_decisions_sample: newDecisions.slice(0, 10),
  };

  fs.writeFileSync(
    DECISIONS_PATH,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        source: "assisted_manual_review_local",
        note: "Decisões locais auditáveis. P1 batch incluído. Não são regras L0/L1/L2.",
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

  // Atualizar classification-final-report preservando histórico
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
        p1_review: report.p1,
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
