import { describe, expect, it } from "vitest";
import {
  applyDecisionBatch,
  assessGroupHomogeneity,
  buildReviewGroup,
  canApproveGroup,
  computePipelineAfterDecisions,
  computeReviewProgress,
  createGroupApprovalDecisions,
  createIndividualDecision,
  createKeepUnclassifiedDecision,
  filterReviewGroups,
  getGroupPriorityMeta,
  getGroupReviewStatus,
  loadDecisionStore,
  makeReviewId,
  mergeDecisions,
  prioritizeReviewGroups,
  searchReviewGroups,
  verifyPipelineIntegrity,
  type CatalogBaseline,
  type ReviewProductRef,
} from "./manualReview";

function refs(names: string[]): ReviewProductRef[] {
  return names.map((name) => ({
    reviewId: makeReviewId(name),
    name,
  }));
}

describe("manualReview assisted", () => {
  it("aprova grupo homogêneo PINHO BRIL como Limpeza", () => {
    const group = buildReviewGroup(
      "PINHO",
      refs([
        "PINHO BRIL LAVANDA 500ML.",
        "PINHO BRIL PLUS 500ML.",
        "PINHO BRIL ACCEPT TIRA LIMO 500ML",
      ]),
    );
    expect(group.heterogeneous).toBe(false);
    expect(group.suggestion).toBe("Limpeza");
    expect(canApproveGroup(group).ok).toBe(true);
    const decisions = createGroupApprovalDecisions(group, "Limpeza");
    expect(decisions).toHaveLength(3);
    expect(decisions.every((d) => d.decisionType === "GROUP_APPROVAL")).toBe(true);
  });

  it("bloqueia aprovação coletiva de grupo heterogêneo", () => {
    const ninho = buildReviewGroup(
      "NINHO",
      refs(["NINHO INSTANTANEO FORT+ 625G", "NINHO AFFANI CABERNET SAUVIGNON 750ML"]),
    );
    expect(ninho.heterogeneous).toBe(true);
    expect(canApproveGroup(ninho).ok).toBe(false);
    expect(() => createGroupApprovalDecisions(ninho, "Mercearia Seca e Básica")).toThrow(
      /heterogêneo/i,
    );
  });

  it("prioriza grupos P1 antes de P4", () => {
    const pinho = buildReviewGroup("PINHO", refs(Array(12).fill("PINHO BRIL LAVANDA 500ML")));
    const kit = buildReviewGroup("KIT", refs(["KIT CHOC", "KIT HIDR"]));
    const sorted = prioritizeReviewGroups([kit, pinho]);
    expect(getGroupPriorityMeta(sorted[0]!).tier).toBeLessThan(
      getGroupPriorityMeta(sorted[sorted.length - 1]!).tier,
    );
    expect(sorted[0]!.groupKey).toBe("PINHO");
  });

  it("filtra homogêneos e heterogêneos", () => {
    const hom = buildReviewGroup("PINHO", refs(["PINHO BRIL 500ML"]));
    const het = buildReviewGroup("NINHO", refs(["NINHO LEITE", "NINHO VINHO"]));
    const decided = new Set<string>();
    expect(filterReviewGroups([hom, het], "homogeneous", decided)).toHaveLength(1);
    expect(filterReviewGroups([hom, het], "heterogeneous", decided)).toHaveLength(1);
  });

  it("busca por código e nome", () => {
    const g = buildReviewGroup("ABC", [
      { reviewId: makeReviewId("PROD X", "123", "789"), name: "PROD X", internalCode: "123", barcode: "789" },
    ]);
    expect(searchReviewGroups([g], "123")).toHaveLength(1);
    expect(searchReviewGroups([g], "PROD")).toHaveLength(1);
    expect(searchReviewGroups([g], "ZZZ")).toHaveLength(0);
  });

  it("calcula progresso por produtos", () => {
    const group = buildReviewGroup("MARG", refs(["MARG A", "MARG B"]));
    const approved = createGroupApprovalDecisions(group, "Frios e Laticínios");
    const progress = computeReviewProgress([group], approved, 100);
    expect(progress.productsReviewed).toBe(2);
    expect(progress.progressPercent).toBe(2);
    expect(progress.productsRemaining).toBe(98);
  });

  it("persistência local append-only", () => {
    const store = loadDecisionStore(null);
    const d1 = createIndividualDecision(refs(["A"])[0]!, "G", null, "Bebidas");
    const next = applyDecisionBatch(store, [d1]);
    expect(next.history).toHaveLength(1);
    const d2 = createIndividualDecision(refs(["A"])[0]!, "G", null, "Mercearia Seca e Básica");
    const next2 = applyDecisionBatch(next, [d2]);
    expect(next2.history).toHaveLength(2);
    expect(next2.latest).toHaveLength(1);
    expect(next2.latest[0]!.chosenCategory).toBe("Mercearia Seca e Básica");
  });

  it("integridade pipeline 19.268", () => {
    const baseline: CatalogBaseline = {
      total: 19_268,
      autoClassified: 15_968,
      autoReviewRequired: 8,
      autoUnclassified: 3_292,
      pendingInitial: 3_300,
      classifiedWithManualBaseline: 16_052,
    };
    const reviewIds = new Set(["r1", "r2"]);
    const decisions = [
      createIndividualDecision(refs(["P1"])[0]!, "G", null, "Limpeza"),
    ];
    const pipeline = computePipelineAfterDecisions(baseline, decisions, reviewIds);
    const check = verifyPipelineIntegrity({ ...pipeline, total: baseline.total });
    expect(check.ok).toBe(true);
    expect(check.sum).toBe(19_268);
  });

  it("status de grupo pending/partial/reviewed", () => {
    const group = buildReviewGroup("X", refs(["A", "B", "C"]));
    const ids = new Set([group.products[0]!.reviewId]);
    expect(getGroupReviewStatus(group, ids)).toBe("partial");
    ids.add(group.products[1]!.reviewId);
    ids.add(group.products[2]!.reviewId);
    expect(getGroupReviewStatus(group, ids)).toBe("reviewed");
  });

  it("MARG homogêneo sugere Frios; FEIJOADA sugere Mercearia", () => {
    expect(
      assessGroupHomogeneity(["MARG DELICIA SUP CS 500G", "MARG. QUALY VITA 250G"]).suggestion,
    ).toBe("Frios e Laticínios");
    expect(assessGroupHomogeneity(["FEIJOADA SWIFT 430G"]).suggestion).toBe(
      "Mercearia Seca e Básica",
    );
  });
});
