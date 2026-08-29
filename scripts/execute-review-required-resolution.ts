/**
 * Resolve os 8 REVIEW_REQUIRED do catálogo Beira Rio — decisões individuais only.
 * Local only — não altera classificador L0/L1/L2 nem Hosted.
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
  computePipelineAfterDecisions,
  createIndividualDecision,
  loadDecisionStore,
  makeReviewId,
  mergeDecisions,
  verifyPipelineIntegrity,
  type DecisionStore,
  type ManualReviewDecision,
  type ReviewProductRef,
  type ReviewRequiredItem,
} from "../src/lib/productCategory/manualReview.ts";

const FILE = path.join("Lista de Produtos", "RELAÇÃO DE PRODUTOS - BEIRA RIO.xlsx");
const DECISIONS_PATH = path.join("scripts", "manual-review-decisions.json");
const GROUPS_PATH = path.join("scripts", "manual-review-groups.json");
const REPORT_PATH = path.join("scripts", "review-required-resolution-report.json");

/** Decisões individuais auditadas — uma por produto REVIEW_REQUIRED. */
const CURATED: Array<{
  reviewId: string;
  chosenCategory: CatalogCategoryName;
  motivo: string;
}> = [
  {
    reviewId: "6053|7896232516104|ACUCAREIRO P/BAR PLASTIGEL-161",
    chosenCategory: "Utilidades e Outros",
    motivo:
      "Açucareiro plástico para bar (Plastigel) — utensílio, não alimento nem higiene pessoal",
  },
  {
    reviewId: "1318|7898758147237|CLORO GEL LIMPA BOM 1L",
    chosenCategory: "Limpeza",
    motivo: "Cloro gel de limpeza doméstica (marca Limpa Bom, 1L)",
  },
  {
    reviewId: "7943|7891017000229|COPO CISPER STYLO AGUA C/ 6",
    chosenCategory: "Utilidades e Outros",
    motivo:
      "Conjunto de 6 copos reutilizáveis Cisper — utensílio doméstico; não descartável nem bebida",
  },
  {
    reviewId: "11090|7891155003335|COPO NADIR PAUL AGUA 7002 6X1",
    chosenCategory: "Utilidades e Outros",
    motivo:
      "Copos de vidro Nadir reutilizáveis (linha água), pack 6 — utilidade doméstica, não bebida",
  },
  {
    reviewId: "16156|7896000712981|CREME P. PENT.GOLD AGUA TERMAL 250G",
    chosenCategory: "Higiene Pessoal",
    motivo:
      "Creme para pentear capilar; 'água termal' é variante do produto, não bebida",
  },
  {
    reviewId: "8885|7896279102452|LOCAO DE LIMPEZA BABY MURIEL 100ML.",
    chosenCategory: "Higiene Pessoal",
    motivo: "Loção de limpeza infantil Muriel — cuidado corporal bebê, não limpeza doméstica",
  },
  {
    reviewId: "8884|7896279102469|LOCAO DE LIMPEZA BABY MURIEL 100ML.",
    chosenCategory: "Higiene Pessoal",
    motivo: "Loção de limpeza infantil Muriel — cuidado corporal bebê, não limpeza doméstica",
  },
  {
    reviewId: "1358|7891150057517|VIM CLORO GEL 700ML",
    chosenCategory: "Limpeza",
    motivo: "Vim cloro gel — produto de limpeza doméstica (700ML)",
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
  const parsed = JSON.parse(raw) as DecisionStore & {
    decisions?: ManualReviewDecision[];
    latest?: ManualReviewDecision[];
    history?: ManualReviewDecision[];
  };
  if (parsed.latest && parsed.history) {
    return { latest: parsed.latest, history: parsed.history };
  }
  if (parsed.decisions) {
    return { latest: parsed.decisions, history: parsed.decisions };
  }
  return loadDecisionStore(raw);
}

function loadReviewRequiredFromSource(): ReviewRequiredItem[] {
  const groupsRaw = JSON.parse(fs.readFileSync(GROUPS_PATH, "utf8")) as {
    review_required_items: ReviewRequiredItem[];
  };
  return groupsRaw.review_required_items ?? [];
}

function prefixFromName(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, " ")
      .trim()
      .split(/\s+/)[0] || "?"
  );
}

function main() {
  const ready = loadReady();
  const store = loadExistingStore();
  const decidedBefore = new Set(store.latest.map((d) => d.reviewId));

  const reviewRequiredIds = new Set<string>();
  const reviewRequiredLive: ReviewRequiredItem[] = [];
  let autoClassified = 0;
  const autoByCat: Record<string, number> = Object.fromEntries(
    CATALOG_CATEGORY_NAMES.map((c) => [c, 0]),
  );

  for (const r of ready) {
    const c = classifyProductName(r.name);
    if (c.status === "CLASSIFIED" && c.categoryName) {
      autoClassified += 1;
      autoByCat[c.categoryName] = (autoByCat[c.categoryName] ?? 0) + 1;
    } else if (c.status === "REVIEW_REQUIRED") {
      const item: ReviewRequiredItem = {
        reviewId: makeReviewId(r.name, r.internalCode, r.barcode),
        name: r.name,
        internalCode: r.internalCode,
        barcode: r.barcode,
        price: r.price,
        reason: c.reason,
        candidates: c.candidates,
        suggestedCategory: c.candidates[0]?.categoryName ?? null,
        confidence: c.candidates.length >= 2 ? "media" : "baixa",
      };
      reviewRequiredIds.add(item.reviewId);
      reviewRequiredLive.push(item);
    }
  }

  if (reviewRequiredLive.length !== 8) {
    console.warn(
      `Aviso: esperados 8 REVIEW_REQUIRED, encontrados ${reviewRequiredLive.length}`,
    );
  }

  const sourceItems = loadReviewRequiredFromSource();
  const newDecisions: ManualReviewDecision[] = [];
  const caseReports: Array<Record<string, unknown>> = [];

  for (const curated of CURATED) {
    const live =
      reviewRequiredLive.find((i) => i.reviewId === curated.reviewId) ??
      sourceItems.find((i) => i.reviewId === curated.reviewId);
    if (!live) {
      throw new Error(`Produto REVIEW_REQUIRED não encontrado: ${curated.reviewId}`);
    }

    const already = decidedBefore.has(curated.reviewId);
    let action: "INDIVIDUAL" | "ALREADY_REVIEWED" = "INDIVIDUAL";

    if (!already) {
      const product: ReviewProductRef = {
        reviewId: live.reviewId,
        name: live.name,
        internalCode: live.internalCode,
        barcode: live.barcode,
        price: live.price,
      };
      const decision = createIndividualDecision(
        product,
        "REVIEW_REQUIRED",
        live.suggestedCategory,
        curated.chosenCategory,
        `REVIEW_REQUIRED resolution — ${curated.motivo}`,
      );
      newDecisions.push(decision);
      decidedBefore.add(curated.reviewId);
    } else {
      action = "ALREADY_REVIEWED";
    }

    caseReports.push({
      produto: live.name,
      codigo: live.internalCode,
      codigo_barras: live.barcode,
      preco: live.price,
      grupo: prefixFromName(live.name),
      motivo_review_required: live.reason,
      categoria_candidata_1: live.candidates[0]?.categoryName ?? null,
      categoria_candidata_2: live.candidates[1]?.categoryName ?? null,
      categoria_sugerida: live.suggestedCategory,
      categoria_anterior: "REVIEW_REQUIRED",
      categoria_final: curated.chosenCategory,
      tipo: action,
      motivo: curated.motivo,
      reviewId: live.reviewId,
      action,
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
    if (d.chosenCategory) {
      manualByCat[d.chosenCategory] = (manualByCat[d.chosenCategory] ?? 0) + 1;
    }
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

  const resolved = newDecisions.length;
  const report = {
    executed_at: new Date().toISOString(),
    phase: "REVIEW_REQUIRED",
    before: {
      REVIEW_REQUIRED: pipelineBefore.REVIEW_REQUIRED,
      CLASSIFIED: pipelineBefore.CLASSIFIED,
      UNCLASSIFIED: pipelineBefore.UNCLASSIFIED,
      decisions_count: store.latest.length,
    },
    after: {
      REVIEW_REQUIRED: pipeline.REVIEW_REQUIRED,
      CLASSIFIED: pipeline.CLASSIFIED,
      UNCLASSIFIED: pipeline.UNCLASSIFIED,
      decisions_count: updatedStore.latest.length,
    },
    summary: {
      review_required_before: pipelineBefore.REVIEW_REQUIRED,
      resolved: resolved,
      kept_review_required: pipeline.REVIEW_REQUIRED,
      review_required_after: pipeline.REVIEW_REQUIRED,
      individual_decisions: resolved,
      kept_unclassified: 0,
    },
    cases: caseReports,
    byCat: finalByCat,
    pipeline,
    integrity,
    new_decisions: newDecisions,
  };

  fs.writeFileSync(
    DECISIONS_PATH,
    JSON.stringify(
      {
        generated_at: report.executed_at,
        source: "assisted_manual_review_local",
        note: "Decisões locais auditáveis. REVIEW_REQUIRED resolution incluída. Não são regras L0/L1/L2.",
        stats: {
          productsReviewed: updatedStore.latest.length,
          pending: ready.length - pipeline.CLASSIFIED - pipeline.REVIEW_REQUIRED,
        },
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
        review_required_resolution: report.summary,
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
