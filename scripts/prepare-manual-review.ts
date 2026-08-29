/**
 * Regenera grupos de revisão assistida + aplica decisões manuais de grupos homogêneos claros.
 * Local only — não toca Hosted nem o XLSX original.
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
  computeReviewStats,
  createGroupApprovalDecisions,
  createIndividualDecision,
  getGroupPriorityMeta,
  makeReviewId,
  mergeDecisions,
  prioritizeReviewGroups,
  type ManualReviewDecision,
  type ManualReviewGroup,
  type ReviewProductRef,
  type ReviewRequiredItem,
} from "../src/lib/productCategory/manualReview.ts";

const FILE = path.join("Lista de Produtos", "RELAÇÃO DE PRODUTOS - BEIRA RIO.xlsx");

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

function main() {
  const ready = loadReady();
  const residual: ReviewProductRef[] = [];
  const autoByCat: Record<string, number> = Object.fromEntries(
    CATALOG_CATEGORY_NAMES.map((c) => [c, 0]),
  );
  let autoClassified = 0;
  let autoReview = 0;
  let autoUnclassified = 0;

  for (const r of ready) {
    const c = classifyProductName(r.name);
    if (c.status === "CLASSIFIED" && c.categoryName) {
      autoClassified += 1;
      autoByCat[c.categoryName] = (autoByCat[c.categoryName] ?? 0) + 1;
    } else if (c.status === "REVIEW_REQUIRED") {
      autoReview += 1;
      residual.push({
        reviewId: makeReviewId(r.name, r.internalCode, r.barcode),
        name: r.name,
        internalCode: r.internalCode,
        barcode: r.barcode,
        price: r.price,
      });
    } else {
      autoUnclassified += 1;
      residual.push({
        reviewId: makeReviewId(r.name, r.internalCode, r.barcode),
        name: r.name,
        internalCode: r.internalCode,
        barcode: r.barcode,
        price: r.price,
      });
    }
  }

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

  const groups: ManualReviewGroup[] = prioritizeReviewGroups(
    [...byPrefix.entries()].map(([key, products]) => buildReviewGroup(key, products)),
  );

  const reviewRequiredItems: ReviewRequiredItem[] = [];
  for (const r of ready) {
    const c = classifyProductName(r.name);
    if (c.status !== "REVIEW_REQUIRED") continue;
    reviewRequiredItems.push({
      reviewId: makeReviewId(r.name, r.internalCode, r.barcode),
      name: r.name,
      internalCode: r.internalCode,
      barcode: r.barcode,
      price: r.price,
      reason: c.reason,
      candidates: c.candidates,
      suggestedCategory: c.candidates[0]?.categoryName ?? null,
      confidence: c.candidates.length >= 2 ? "media" : "baixa",
    });
  }

  // Decisões manuais iniciais: só grupos homogêneos com confiança alta/média e sugestão clara
  let decisions: ManualReviewDecision[] = [];
  const curatedKeys = new Set(["PINHO", "MARG", "FEIJOADA", "CR"]);

  for (const group of groups) {
    if (!curatedKeys.has(group.groupKey)) continue;
    if (!group.groupApprovalAllowed || !group.suggestion) continue;
    if (group.confidence !== "alta" && group.confidence !== "media") continue;
    try {
      decisions = mergeDecisions(
        decisions,
        createGroupApprovalDecisions(group, group.suggestion),
      );
    } catch {
      // bloqueado — ok
    }
  }

  // NINHO: individual — leite/pó → Mercearia; vinho → Bebidas; ambíguos → KEPT
  const ninho = groups.find((g) => g.groupKey === "NINHO");
  if (ninho) {
    for (const p of ninho.products) {
      const n = p.name.toUpperCase();
      if (/CABERNET|SAUVIGNON|AFFANI|VINHO/.test(n)) {
        decisions = mergeDecisions(decisions, [
          createIndividualDecision(p, "NINHO", null, "Bebidas"),
        ]);
      } else if (/FRUTI|SOLEIL|LOLEIL|BISC/.test(n)) {
        // iogurte/doce Ninho — mercearia ou frios; preferir mercearia seco/doce embalado
        decisions = mergeDecisions(decisions, [
          createIndividualDecision(p, "NINHO", null, "Mercearia Seca e Básica"),
        ]);
      } else if (/LEPO|LACT|FORT|INST|1\+|3\+|COMPTO/.test(n)) {
        decisions = mergeDecisions(decisions, [
          createIndividualDecision(p, "NINHO", null, "Mercearia Seca e Básica"),
        ]);
      }
      // demais NINHO ficam pendentes se não casarem
    }
  }

  // CORPO A CORPO → higiene individual; CORPO E SABOR → mercearia
  const corpo = groups.find((g) => g.groupKey === "CORPO");
  if (corpo) {
    for (const p of corpo.products) {
      const n = p.name.toUpperCase();
      if (/CORPO A CORPO/.test(n)) {
        decisions = mergeDecisions(decisions, [
          createIndividualDecision(p, "CORPO", "Higiene Pessoal", "Higiene Pessoal"),
        ]);
      } else if (/CORPO E SABOR/.test(n)) {
        decisions = mergeDecisions(decisions, [
          createIndividualDecision(p, "CORPO", null, "Mercearia Seca e Básica"),
        ]);
      }
    }
  }

  // KIT: individual por evidência; ambíguos não forçar
  const kit = groups.find((g) => g.groupKey === "KIT");
  if (kit) {
    for (const p of kit.products) {
      const n = p.name.toUpperCase();
      if (/CHOC|CHOKITO|KAT NESTLE|YOKI|FACIL/.test(n)) {
        decisions = mergeDecisions(decisions, [
          createIndividualDecision(p, "KIT", null, "Mercearia Seca e Básica"),
        ]);
      } else if (/HIDR|NIELY|SENADOR|SUISSA|INTIMUS|GB PROMOPAC|AERO/.test(n)) {
        decisions = mergeDecisions(decisions, [
          createIndividualDecision(p, "KIT", null, "Higiene Pessoal"),
        ]);
      } else if (/PRATICE|LIMP/.test(n)) {
        decisions = mergeDecisions(decisions, [
          createIndividualDecision(p, "KIT", null, "Limpeza"),
        ]);
      } else if (/PIA|ELETR|FORT ELETR/.test(n)) {
        decisions = mergeDecisions(decisions, [
          createIndividualDecision(p, "KIT", null, "Utilidades e Outros"),
        ]);
      }
    }
  }

  const overlay = categoryOverlayFromDecisions(decisions);
  const stats = computeReviewStats(groups, decisions);

  const manualByCat: Record<string, number> = Object.fromEntries(
    CATALOG_CATEGORY_NAMES.map((c) => [c, 0]),
  );
  let manualClassified = 0;
  let kept = 0;
  for (const d of decisions) {
    if (d.chosenCategory) {
      manualClassified += 1;
      manualByCat[d.chosenCategory] = (manualByCat[d.chosenCategory] ?? 0) + 1;
    } else if (d.decisionType === "KEPT_UNCLASSIFIED") {
      kept += 1;
    }
  }

  const finalByCat: Record<string, number> = { ...autoByCat };
  for (const c of CATALOG_CATEGORY_NAMES) {
    finalByCat[c] = (autoByCat[c] ?? 0) + (manualByCat[c] ?? 0);
  }

  const finalClassified = autoClassified + manualClassified;

  const residualReviewIds = new Set(
    ready
      .filter((r) => classifyProductName(r.name).status === "REVIEW_REQUIRED")
      .map((r) => makeReviewId(r.name, r.internalCode, r.barcode)),
  );
  let reviewLeft = 0;
  for (const id of residualReviewIds) {
    const decided = decisions.find((d) => d.reviewId === id);
    if (!decided || (decided.decisionType !== "KEPT_UNCLASSIFIED" && !decided.chosenCategory)) {
      if (!overlay.has(id) && decided?.decisionType !== "KEPT_UNCLASSIFIED") {
        reviewLeft += 1;
      }
    }
  }
  // Produto REVIEW sem decisão permanece REVIEW_REQUIRED; com decisão classificadora sai do pool.
  reviewLeft = [...residualReviewIds].filter((id) => !overlay.has(id)).length;

  const finalCounts = {
    CLASSIFIED: finalClassified,
    REVIEW_REQUIRED: reviewLeft,
    UNCLASSIFIED: ready.length - finalClassified - reviewLeft,
  };

  const sum =
    Object.values(finalByCat).reduce((a, b) => a + b, 0) +
    finalCounts.REVIEW_REQUIRED +
    finalCounts.UNCLASSIFIED;

  const catalogBaseline = {
    total: ready.length,
    auto_classified: autoClassified,
    auto_review_required: autoReview,
    auto_unclassified: autoUnclassified,
    pending_initial: residual.length,
    classified_with_manual_baseline: finalClassified,
  };

  const groupsPayload = {
    total_remaining: residual.length,
    catalog_baseline: catalogBaseline,
    review_required_items: reviewRequiredItems,
    instructions:
      "Revisão manual assistida: aprovar grupo só se homogêneo; caso contrário revisar individualmente. Sugestões não são aplicadas automaticamente.",
    groups: groups.map((g) => {
      const priority = getGroupPriorityMeta(g);
      return {
        group_key: g.groupKey,
        quantity: g.quantity,
        products: g.products.map((p) => ({
          review_id: p.reviewId,
          name: p.name,
          internal_code: p.internalCode,
          barcode: p.barcode,
          price: p.price,
        })),
        products_total: g.quantity,
        suggestion: g.suggestion,
        confidence: g.confidence,
        note: g.note,
        heterogeneous: g.heterogeneous,
        group_approval_allowed: g.groupApprovalAllowed,
        heterogeneity_reason: g.heterogeneityReason ?? null,
        priority_tier: priority.tier,
        priority_score: priority.score,
        priority_label: priority.label,
        action_placeholder: g.groupApprovalAllowed
          ? ["Aprovar grupo", "Escolher outra categoria", "Revisar individualmente", "Manter sem classificação"]
          : ["Revisar individualmente", "Manter sem classificação"],
      };
    }),
  };

  fs.writeFileSync(
    path.join("scripts", "manual-review-groups.json"),
    JSON.stringify(groupsPayload, null, 2),
    "utf8",
  );

  const decisionsPayload = {
    generated_at: new Date().toISOString(),
    source: "assisted_manual_review_local",
    note: "Decisões locais auditáveis. Não aplicadas no Hosted. Não são regras L0/L1/L2.",
    stats,
    latest: decisions,
    history: decisions,
  };
  fs.writeFileSync(
    path.join("scripts", "manual-review-decisions.json"),
    JSON.stringify(decisionsPayload, null, 2),
    "utf8",
  );

  // Atualizar relatório final preservando histórico
  let previousReport: Record<string, unknown> = {};
  const reportPath = path.join("scripts", "classification-final-report.json");
  if (fs.existsSync(reportPath)) {
    previousReport = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  }

  const report = {
    ...previousReport,
    history: [
      ...((previousReport.history as unknown[]) ?? []),
      {
        phase: "pre_manual_review",
        counts: previousReport.counts ?? {
          CLASSIFIED: 15968,
          REVIEW_REQUIRED: 8,
          UNCLASSIFIED: 3292,
        },
      },
      {
        phase: "manual_review_assisted",
        counts: finalCounts,
        stats,
      },
    ],
    previous_before_manual: {
      CLASSIFIED: 15968,
      REVIEW_REQUIRED: 8,
      UNCLASSIFIED: 3292,
    },
    ready: ready.length,
    counts: finalCounts,
    byCat: finalByCat,
    sum_check: sum,
    manual_review: {
      stats,
      decisions_count: decisions.length,
      overlay_classified: manualClassified,
      main_decisions: [
        { group: "PINHO", type: "GROUP_APPROVAL", category: "Limpeza" },
        { group: "MARG", type: "GROUP_APPROVAL", category: "Frios e Laticínios" },
        { group: "FEIJOADA", type: "GROUP_APPROVAL", category: "Mercearia Seca e Básica" },
        { group: "CR", type: "GROUP_APPROVAL", category: "Higiene Pessoal" },
        { group: "CORPO", type: "INDIVIDUAL", note: "CORPO A CORPO→Higiene; CORPO E SABOR→Mercearia" },
        { group: "NINHO", type: "INDIVIDUAL", note: "leite/pó→Mercearia; Affani vinho→Bebidas" },
        { group: "KIT", type: "INDIVIDUAL", note: "por evidência; ambíguos pendentes" },
      ],
    },
    auto_layer_preserved: {
      CLASSIFIED: autoClassified,
      REVIEW_REQUIRED: autoReview,
      UNCLASSIFIED: autoUnclassified,
      byCat: autoByCat,
    },
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  // Snapshot para a UI (import estático)
  fs.writeFileSync(
    path.join("src", "lib", "productCategory", "manualReviewGroups.snapshot.json"),
    JSON.stringify(groupsPayload, null, 2),
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        before: { CLASSIFIED: 15968, REVIEW_REQUIRED: 8, UNCLASSIFIED: 3292 },
        after: finalCounts,
        sum_check: sum,
        stats,
        decisions: decisions.length,
        top_homogeneous: groups
          .filter((g) => g.groupApprovalAllowed)
          .slice(0, 10)
          .map((g) => ({
            key: g.groupKey,
            q: g.quantity,
            suggestion: g.suggestion,
            confidence: g.confidence,
          })),
        top_heterogeneous: groups
          .filter((g) => g.heterogeneous)
          .slice(0, 10)
          .map((g) => ({ key: g.groupKey, q: g.quantity, reason: g.heterogeneityReason })),
      },
      null,
      2,
    ),
  );
}

main();
