/**
 * Revisão final dos 27 candidatos de alta confiança — local only.
 * Somente os 5 grupos auditados. Não altera classificador L0/L1/L2.
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
  computePipelineAfterDecisions,
  createGroupApprovalDecisions,
  loadDecisionStore,
  makeReviewId,
  mergeDecisions,
  verifyPipelineIntegrity,
  type DecisionStore,
  type ManualReviewDecision,
  type ManualReviewGroup,
  type ReviewProductRef,
} from "../src/lib/productCategory/manualReview.ts";

const FILE = path.join("Lista de Produtos", "RELAÇÃO DE PRODUTOS - BEIRA RIO.xlsx");
const DECISIONS_PATH = path.join("scripts", "manual-review-decisions.json");
const REPORT_PATH = path.join("scripts", "final-high-confidence-review-report.json");

const HIGH_CONFIDENCE_GROUPS: Array<{
  groupKey: string;
  category: CatalogCategoryName;
  motivo: string;
  validate: (name: string) => boolean;
}> = [
  {
    groupKey: "AROMATIZANTE",
    category: "Limpeza",
    motivo: "Aromatizantes de ambiente e veicular — limpeza/aroma doméstico",
    validate: (n) => /^AROMATIZANTE\b/i.test(n),
  },
  {
    groupKey: "PRATOS",
    category: "Produtos Descartáveis",
    motivo: "Pratos descartáveis/de plástico para uso único",
    validate: (n) =>
      /^PRATOS\b/i.test(n) &&
      (/DESC|PLASTICOS|PLÁSTICOS/i.test(n) || /MARATA|COPOBRAS|COPOZAN|BEL PLAST|JUNCO|ULTRA/i.test(n)),
  },
  {
    groupKey: "DESODORIZANTE",
    category: "Limpeza",
    motivo: "Desodorizantes sanitários para vaso sanitário",
    validate: (n) => /^DESODORIZANTE\s+SANITARIO/i.test(n),
  },
  {
    groupKey: "SABONETES",
    category: "Higiene Pessoal",
    motivo: "Sabonetes em barra La Flores — higiene pessoal",
    validate: (n) => /^SABONETES\s+LA FLORES/i.test(n),
  },
  {
    groupKey: "ODORIZANTE",
    category: "Limpeza",
    motivo: "Odorizantes automotivos — aroma/limpeza veicular",
    validate: (n) => /^ODORIZANTE\b/i.test(n),
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

function main() {
  const ready = loadReady();
  const store = loadExistingStore();
  const decidedBefore = new Set(store.latest.map((d) => d.reviewId));

  const autoByCat: Record<string, number> = Object.fromEntries(
    CATALOG_CATEGORY_NAMES.map((c) => [c, 0]),
  );
  let autoClassified = 0;
  const reviewRequiredIds = new Set<string>();
  const unclassifiedByPrefix = new Map<string, ReviewProductRef[]>();

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
    } else if (c.status === "UNCLASSIFIED" && !decidedBefore.has(ref.reviewId)) {
      const prefix =
        ref.name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toUpperCase()
          .replace(/[^A-Z0-9\s]/g, " ")
          .trim()
          .split(/\s+/)[0] || "?";
      if (!unclassifiedByPrefix.has(prefix)) unclassifiedByPrefix.set(prefix, []);
      unclassifiedByPrefix.get(prefix)!.push(ref);
    }
  }

  type ProductValidation = {
    produto: string;
    codigo: string | null | undefined;
    ean: string | null | undefined;
    reviewId: string;
    categoria_sugerida: CatalogCategoryName;
    motivo: string;
    passes: boolean;
    fail_reason?: string;
  };

  type GroupReport = {
    groupKey: string;
    categoria: CatalogCategoryName;
    motivo: string;
    produtos: ProductValidation[];
    homogeneous: boolean;
    action: "GROUP_APPROVAL" | "BLOCKED" | "ALREADY_REVIEWED" | "PARTIAL";
    productsApproved: number;
    productsKeptUnclassified: number;
    blockReason?: string;
  };

  const groupReports: GroupReport[] = [];
  let newDecisions: ManualReviewDecision[] = [];
  let totalApproved = 0;
  let totalKept = 0;
  let groupsApproved = 0;

  for (const spec of HIGH_CONFIDENCE_GROUPS) {
    const products = unclassifiedByPrefix.get(spec.groupKey) ?? [];
    const group = buildReviewGroup(spec.groupKey, products);

    const validations: ProductValidation[] = products.map((p) => {
      const passes = spec.validate(p.name);
      return {
        produto: p.name,
        codigo: p.internalCode,
        ean: p.barcode,
        reviewId: p.reviewId,
        categoria_sugerida: spec.category,
        motivo: spec.motivo,
        passes,
        fail_reason: passes ? undefined : "Produto não corresponde ao padrão esperado do grupo",
      };
    });

    const pending = products.filter((p) => !decidedBefore.has(p.reviewId));
    const alreadyDone = products.length - pending.length;
    const failed = validations.filter((v) => !v.passes);
    const homogeneous = failed.length === 0 && products.length > 0;

    if (products.length === 0) {
      groupReports.push({
        groupKey: spec.groupKey,
        categoria: spec.category,
        motivo: spec.motivo,
        produtos: validations,
        homogeneous: false,
        action: "BLOCKED",
        productsApproved: 0,
        productsKeptUnclassified: 0,
        blockReason: "Grupo não encontrado entre UNCLASSIFIED pendentes",
      });
      continue;
    }

    if (alreadyDone === products.length) {
      groupReports.push({
        groupKey: spec.groupKey,
        categoria: spec.category,
        motivo: spec.motivo,
        produtos: validations,
        homogeneous,
        action: "ALREADY_REVIEWED",
        productsApproved: 0,
        productsKeptUnclassified: 0,
        blockReason: `${alreadyDone} produto(s) já tinham decisão`,
      });
      continue;
    }

    if (!homogeneous) {
      totalKept += pending.filter((p) => !validations.find((v) => v.reviewId === p.reviewId)?.passes).length;
      groupReports.push({
        groupKey: spec.groupKey,
        categoria: spec.category,
        motivo: spec.motivo,
        produtos: validations,
        homogeneous: false,
        action: "BLOCKED",
        productsApproved: 0,
        productsKeptUnclassified: failed.length,
        blockReason: `${failed.length} produto(s) falharam validação: ${failed.map((f) => f.produto).join("; ")}`,
      });
      continue;
    }

    const approvedProducts = pending.filter((p) => spec.validate(p.name));
    const rejectedProducts = pending.filter((p) => !spec.validate(p.name));
    totalKept += rejectedProducts.length;

    if (approvedProducts.length === 0) {
      groupReports.push({
        groupKey: spec.groupKey,
        categoria: spec.category,
        motivo: spec.motivo,
        produtos: validations,
        homogeneous: true,
        action: "ALREADY_REVIEWED",
        productsApproved: 0,
        productsKeptUnclassified: 0,
      });
      continue;
    }

    const partialGroup: ManualReviewGroup = {
      ...group,
      products: approvedProducts,
      quantity: approvedProducts.length,
      suggestion: spec.category,
      groupApprovalAllowed: true,
      heterogeneous: false,
    };

    const batch = createGroupApprovalDecisions(
      partialGroup,
      spec.category,
      undefined,
      `Final high-confidence review — ${spec.groupKey}: ${spec.motivo}`,
    );
    newDecisions = mergeDecisions(newDecisions, batch);
    totalApproved += batch.length;
    groupsApproved += 1;
    for (const d of batch) decidedBefore.add(d.reviewId);

    groupReports.push({
      groupKey: spec.groupKey,
      categoria: spec.category,
      motivo: spec.motivo,
      produtos: validations,
      homogeneous: true,
      action: rejectedProducts.length > 0 ? "PARTIAL" : "GROUP_APPROVAL",
      productsApproved: batch.length,
      productsKeptUnclassified: rejectedProducts.length,
      blockReason:
        rejectedProducts.length > 0
          ? `${rejectedProducts.length} produto(s) mantidos UNCLASSIFIED por exceção`
          : undefined,
    });
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

  const pipelineBefore = computePipelineAfterDecisions(
    {
      total: ready.length,
      autoClassified,
      autoReviewRequired: reviewRequiredIds.size,
      autoUnclassified: ready.length - autoClassified - reviewRequiredIds.size,
      pendingInitial: 0,
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
      pendingInitial: 0,
      classifiedWithManualBaseline: 0,
    },
    updatedStore.latest,
    reviewRequiredIds,
  );

  const integrity = verifyPipelineIntegrity({ ...pipeline, total: ready.length });
  const coverageBefore = (pipelineBefore.CLASSIFIED / ready.length) * 100;
  const coverageAfter = (pipeline.CLASSIFIED / ready.length) * 100;

  const report = {
    executed_at: new Date().toISOString(),
    phase: "FINAL_HIGH_CONFIDENCE",
    note: "Última revisão manual — somente 27 candidatos de alta confiança. Classificação encerrada.",
    before: {
      CLASSIFIED: pipelineBefore.CLASSIFIED,
      REVIEW_REQUIRED: pipelineBefore.REVIEW_REQUIRED,
      UNCLASSIFIED: pipelineBefore.UNCLASSIFIED,
      decisions_count: store.latest.length,
      coverage_percent: coverageBefore.toFixed(2),
    },
    after: {
      CLASSIFIED: pipeline.CLASSIFIED,
      REVIEW_REQUIRED: pipeline.REVIEW_REQUIRED,
      UNCLASSIFIED: pipeline.UNCLASSIFIED,
      decisions_count: updatedStore.latest.length,
      coverage_percent: coverageAfter.toFixed(2),
    },
    summary: {
      grupos_analisados: HIGH_CONFIDENCE_GROUPS.length,
      produtos_analisados: groupReports.reduce((n, g) => n + g.produtos.length, 0),
      grupos_aprovados: groupsApproved,
      produtos_aprovados: totalApproved,
      decisoes_individuais: 0,
      produtos_mantidos_unclassified: totalKept,
      group_approvals: totalApproved,
    },
    groups: groupReports,
    byCat: finalByCat,
    pipeline,
    integrity,
    coverage_previous: coverageBefore.toFixed(2),
    coverage_final: coverageAfter.toFixed(2),
    new_decisions: newDecisions,
    system_state: {
      excel_original_alterado: false,
      hosted_alterado: false,
      produtos_importados: false,
      migration_aplicada: false,
      deploy: false,
      commit: false,
      push: false,
    },
  };

  fs.writeFileSync(
    DECISIONS_PATH,
    JSON.stringify(
      {
        generated_at: report.executed_at,
        source: "assisted_manual_review_local",
        note: "Decisões locais auditáveis. Revisão final 27 alta confiança incluída. Classificação manual encerrada.",
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
        final_high_confidence_review: report.summary,
        manual_review_decisions: updatedStore.latest.length,
        classification_manual_complete: true,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(JSON.stringify(report, null, 2));
}

main();
