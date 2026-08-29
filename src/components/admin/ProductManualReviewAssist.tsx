import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Download, Search } from "lucide-react";
import { toast } from "sonner";
import { CATALOG_CATEGORY_NAMES, type CatalogCategoryName } from "@/lib/productCategory/classifyProduct";
import {
  applyDecisionBatch,
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
  saveDecisionStore,
  searchReviewGroups,
  verifyPipelineIntegrity,
  type CatalogBaseline,
  type DecisionStore,
  type ManualReviewDecision,
  type ManualReviewGroup,
  type ReviewGroupFilter,
  type ReviewProductRef,
  type ReviewRequiredItem,
} from "@/lib/productCategory/manualReview";
import groupsSnapshot from "@/lib/productCategory/manualReviewGroups.snapshot.json";

type SnapshotGroup = {
  group_key: string;
  quantity: number;
  products: Array<{
    review_id: string;
    name: string;
    internal_code?: string | null;
    barcode?: string | null;
    price?: number | null;
  }>;
  suggestion: CatalogCategoryName | null;
  confidence: ManualReviewGroup["confidence"];
  note: string;
  heterogeneous: boolean;
  group_approval_allowed: boolean;
  heterogeneity_reason?: string | null;
  priority_tier?: number;
  priority_score?: number;
  priority_label?: string;
};

type SnapshotData = {
  total_remaining: number;
  catalog_baseline?: {
    total: number;
    auto_classified: number;
    auto_review_required: number;
    auto_unclassified: number;
    pending_initial: number;
    classified_with_manual_baseline: number;
  };
  review_required_items?: Array<{
    review_id: string;
    name: string;
    internal_code?: string | null;
    barcode?: string | null;
    price?: number | null;
    reason: string;
    candidates: Array<{ categoryName: CatalogCategoryName; score: number }>;
    suggestedCategory: CatalogCategoryName | null;
    confidence: ManualReviewGroup["confidence"];
  }>;
  groups: SnapshotGroup[];
};

const STORAGE_KEY = "horti.beiraRio.manualReviewDecisions";

function parseSnapshot(): {
  groups: ManualReviewGroup[];
  baseline: CatalogBaseline;
  reviewRequired: ReviewRequiredItem[];
} {
  const raw = groupsSnapshot as SnapshotData;
  const baseline: CatalogBaseline = raw.catalog_baseline
    ? {
        total: raw.catalog_baseline.total,
        autoClassified: raw.catalog_baseline.auto_classified,
        autoReviewRequired: raw.catalog_baseline.auto_review_required,
        autoUnclassified: raw.catalog_baseline.auto_unclassified,
        pendingInitial: raw.catalog_baseline.pending_initial,
        classifiedWithManualBaseline: raw.catalog_baseline.classified_with_manual_baseline,
      }
    : {
        total: 19_268,
        autoClassified: 15_968,
        autoReviewRequired: 8,
        autoUnclassified: 3_292,
        pendingInitial: raw.total_remaining,
        classifiedWithManualBaseline: 16_052,
      };

  const groups = (raw.groups ?? []).map(
    (g): ManualReviewGroup => ({
      groupKey: g.group_key,
      quantity: g.quantity,
      products: g.products.map(
        (p): ReviewProductRef => ({
          reviewId: p.review_id,
          name: p.name,
          internalCode: p.internal_code,
          barcode: p.barcode,
          price: typeof p.price === "string" ? parseFloat(p.price) : p.price,
        }),
      ),
      suggestion: g.suggestion,
      confidence: g.confidence,
      note: g.note,
      heterogeneous: g.heterogeneous,
      groupApprovalAllowed: g.group_approval_allowed,
      heterogeneityReason: g.heterogeneity_reason ?? undefined,
    }),
  );

  const reviewRequired: ReviewRequiredItem[] = (raw.review_required_items ?? []).map((r) => ({
    reviewId: r.review_id,
    name: r.name,
    internalCode: r.internal_code,
    barcode: r.barcode,
    price: typeof r.price === "string" ? parseFloat(r.price) : r.price,
    reason: r.reason,
    candidates: r.candidates,
    suggestedCategory: r.suggestedCategory,
    confidence: r.confidence,
  }));

  return { groups, baseline, reviewRequired };
}

function loadStore(): DecisionStore {
  return loadDecisionStore(localStorage.getItem(STORAGE_KEY));
}

function persistStore(store: DecisionStore) {
  localStorage.setItem(STORAGE_KEY, saveDecisionStore(store));
}

const FILTERS: { id: ReviewGroupFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "alta", label: "Alta confiança" },
  { id: "media", label: "Média confiança" },
  { id: "baixa", label: "Baixa confiança" },
  { id: "homogeneous", label: "Homogêneos" },
  { id: "heterogeneous", label: "Heterogêneos" },
  { id: "large_quantity", label: "Maior quantidade" },
  { id: "pending", label: "Pendentes" },
  { id: "reviewed", label: "Revisados" },
];

export function ProductManualReviewAssist() {
  const { groups: allGroups, baseline, reviewRequired } = useMemo(() => parseSnapshot(), []);
  const [store, setStore] = useState<DecisionStore>(() => loadStore());
  const [filter, setFilter] = useState<ReviewGroupFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [individualMode, setIndividualMode] = useState(false);
  const [altCategory, setAltCategory] = useState<CatalogCategoryName | "">("");
  const [confirmGroup, setConfirmGroup] = useState(false);
  const [observation, setObservation] = useState("");

  const decisions = store.latest;
  const decidedIds = useMemo(() => new Set(decisions.map((d) => d.reviewId)), [decisions]);

  const filteredGroups = useMemo(() => {
    let list = filterReviewGroups(allGroups, filter, decidedIds);
    list = searchReviewGroups(list, search);
    return list;
  }, [allGroups, filter, search, decidedIds]);

  const group =
    filteredGroups.find((g) => g.groupKey === selectedGroupKey) ??
    filteredGroups[0] ??
    null;

  const progress = useMemo(
    () => computeReviewProgress(allGroups, decisions, baseline.pendingInitial),
    [allGroups, decisions, baseline.pendingInitial],
  );

  const pipeline = useMemo(() => {
    const reviewIds = new Set(reviewRequired.map((r) => r.reviewId));
    return computePipelineAfterDecisions(baseline, decisions, reviewIds);
  }, [baseline, decisions, reviewRequired]);

  const integrity = verifyPipelineIntegrity({ ...pipeline, total: baseline.total });

  const applyIncoming = (incoming: ManualReviewDecision[]) => {
    const next = applyDecisionBatch(store, incoming);
    setStore(next);
    persistStore(next);
  };

  const handleApproveGroup = () => {
    if (!group?.suggestion) return;
    const gate = canApproveGroup(group);
    if (!gate.ok) {
      toast.error(gate.message ?? "Grupo bloqueado");
      return;
    }
    setConfirmGroup(true);
  };

  const confirmApproveGroup = () => {
    if (!group?.suggestion) return;
    try {
      const ids = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
      const created = createGroupApprovalDecisions(
        group,
        group.suggestion,
        ids.length ? ids : undefined,
        observation || undefined,
      );
      applyIncoming(created);
      toast.success(`${created.length} produto(s) → ${group.suggestion}`);
      setConfirmGroup(false);
      setSelected({});
      setObservation("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha");
    }
  };

  const handleReviewRequired = (item: ReviewRequiredItem, category: CatalogCategoryName) => {
    applyIncoming([
      createIndividualDecision(
        item,
        "REVIEW_REQUIRED",
        item.suggestedCategory,
        category,
        observation || undefined,
      ),
    ]);
    toast.success(`REVIEW_REQUIRED → ${category}`);
  };

  const exportDecisions = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exported_at: new Date().toISOString(),
            stats: progress,
            pipeline,
            latest: store.latest,
            history: store.history,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "manual-review-decisions.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (allGroups.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Snapshot local vazio. Execute prepare-manual-review.ts.</p>
      </div>
    );
  }

  const coverage =
    baseline.total > 0 ? ((pipeline.CLASSIFIED / baseline.total) * 100).toFixed(1) : "0";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Revisão do catálogo Beira Rio
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Fila local — UNCLASSIFIED / REVIEW_REQUIRED. Não altera os 16.052+ já classificados
            automaticamente.
          </p>
        </div>
        <button
          type="button"
          onClick={exportDecisions}
          className="h-9 px-3 rounded-lg border text-xs font-bold inline-flex items-center gap-1.5"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar decisões
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
        <Stat label="Total" value={String(baseline.total)} />
        <Stat label="Classificados" value={String(pipeline.CLASSIFIED)} />
        <Stat label="Pendentes" value={String(progress.productsRemaining)} />
        <Stat label="Cobertura" value={`${coverage}%`} />
        <Stat label="Progresso revisão" value={`${progress.progressPercent.toFixed(1)}%`} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <Stat label="Grupos pendentes" value={String(progress.groupsPending)} />
        <Stat label="Revisados" value={String(progress.productsReviewed)} />
        <Stat label="Em grupo" value={String(progress.approvedByGroup)} />
        <Stat label="Individuais" value={String(progress.classifiedIndividually)} />
      </div>

      {!integrity.ok ? (
        <p className="text-xs text-red-600 font-medium">
          Integridade: {integrity.sum} ≠ {integrity.expected}
        </p>
      ) : null}

      {reviewRequired.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2">
          <p className="text-xs font-bold text-amber-900">
            Prioridade — REVIEW_REQUIRED ({reviewRequired.length})
          </p>
          {reviewRequired.map((item) => {
            const done = decidedIds.has(item.reviewId);
            return (
              <div
                key={item.reviewId}
                className="rounded-lg border border-amber-100 bg-white p-2 space-y-1"
              >
                <p className="text-xs font-semibold">{item.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {item.internalCode ? `Cód. ${item.internalCode} · ` : ""}
                  {item.barcode && item.barcode !== "0" ? `EAN ${item.barcode}` : ""}
                </p>
                <p className="text-[10px]">Motivo: {item.reason}</p>
                <p className="text-[10px]">
                  Candidatos:{" "}
                  {item.candidates.map((c) => `${c.categoryName} (${c.score})`).join(" · ") || "—"}
                </p>
                <p className="text-[10px]">
                  Sugestão: {item.suggestedCategory ?? "—"} · Confiança: {item.confidence}
                </p>
                {!done ? (
                  <select
                    className="h-8 w-full px-2 rounded-lg border text-xs mt-1"
                    defaultValue=""
                    onChange={(e) => {
                      const v = e.target.value as CatalogCategoryName;
                      if (v) handleReviewRequired(item, v);
                    }}
                  >
                    <option value="">Escolher categoria…</option>
                    {CATALOG_CATEGORY_NAMES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-[10px] text-emerald-700 font-medium">✓ Decidido</p>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar grupo, produto, código…"
            className="h-8 w-full pl-8 pr-2 rounded-lg border text-xs"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as ReviewGroupFilter)}
          className="h-8 px-2 rounded-lg border text-xs"
        >
          {FILTERS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-3 min-h-[320px]">
        <div className="border border-border rounded-xl overflow-y-auto max-h-96">
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-muted/80">
              <tr>
                <th className="text-left p-2">Grupo</th>
                <th className="text-right p-2">Qtd</th>
                <th className="text-right p-2">P</th>
              </tr>
            </thead>
            <tbody>
              {filteredGroups.map((g) => {
                const meta = getGroupPriorityMeta(g);
                const status = getGroupReviewStatus(g, decidedIds);
                return (
                  <tr
                    key={g.groupKey}
                    onClick={() => {
                      setSelectedGroupKey(g.groupKey);
                      setIndividualMode(false);
                      setConfirmGroup(false);
                      setSelected({});
                    }}
                    className={`cursor-pointer border-t border-border hover:bg-muted/40 ${
                      group?.groupKey === g.groupKey ? "bg-primary/10" : ""
                    }`}
                  >
                    <td className="p-2 font-medium">
                      {g.groupKey}
                      {g.heterogeneous ? " ⚠" : ""}
                      {status === "reviewed" ? " ✓" : status === "partial" ? " ◐" : ""}
                    </td>
                    <td className="p-2 text-right">{g.quantity}</td>
                    <td className="p-2 text-right">P{meta.tier}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {group ? (
          <GroupPanel
            group={group}
            decidedIds={decidedIds}
            selected={selected}
            setSelected={setSelected}
            individualMode={individualMode}
            setIndividualMode={setIndividualMode}
            altCategory={altCategory}
            setAltCategory={setAltCategory}
            confirmGroup={confirmGroup}
            setConfirmGroup={setConfirmGroup}
            observation={observation}
            setObservation={setObservation}
            onApprove={handleApproveGroup}
            onConfirmApprove={confirmApproveGroup}
            onApplyAlt={() => {
              if (!altCategory) return;
              if (group.heterogeneous) {
                toast.error("Grupo heterogêneo");
                return;
              }
              const ids = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
              const targets = ids.length
                ? group.products.filter((p) => ids.includes(p.reviewId))
                : group.products;
              applyIncoming(
                targets.map((p) =>
                  createIndividualDecision(p, group.groupKey, group.suggestion, altCategory, observation || undefined),
                ),
              );
              toast.success(`${targets.length} → ${altCategory}`);
              setAltCategory("");
            }}
            onIndividual={(p, cat) =>
              applyIncoming([
                createIndividualDecision(p, group.groupKey, group.suggestion, cat, observation || undefined),
              ])
            }
            onKeep={(p) =>
              applyIncoming([
                createKeepUnclassifiedDecision(p, group.groupKey, group.suggestion, observation || undefined),
              ])
            }
          />
        ) : (
          <p className="text-sm text-muted-foreground p-4">Nenhum grupo corresponde ao filtro.</p>
        )}
      </div>
    </div>
  );
}

function GroupPanel({
  group,
  decidedIds,
  selected,
  setSelected,
  individualMode,
  setIndividualMode,
  altCategory,
  setAltCategory,
  confirmGroup,
  setConfirmGroup,
  observation,
  setObservation,
  onApprove,
  onConfirmApprove,
  onApplyAlt,
  onIndividual,
  onKeep,
}: {
  group: ManualReviewGroup;
  decidedIds: Set<string>;
  selected: Record<string, boolean>;
  setSelected: Dispatch<SetStateAction<Record<string, boolean>>>;
  individualMode: boolean;
  setIndividualMode: (v: boolean) => void;
  altCategory: CatalogCategoryName | "";
  setAltCategory: (v: CatalogCategoryName | "") => void;
  confirmGroup: boolean;
  setConfirmGroup: (v: boolean) => void;
  observation: string;
  setObservation: (v: string) => void;
  onApprove: () => void;
  onConfirmApprove: () => void;
  onApplyAlt: () => void;
  onIndividual: (p: ReviewProductRef, cat: CatalogCategoryName) => void;
  onKeep: (p: ReviewProductRef) => void;
}) {
  const meta = getGroupPriorityMeta(group);
  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="rounded-xl border border-border p-3 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold">GRUPO: {group.groupKey}</p>
          <p className="text-xs text-muted-foreground">
            Qtd: {group.quantity} · {meta.label} · score {meta.score.toFixed(1)}
          </p>
        </div>
        {group.heterogeneous ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            Heterogêneo
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Homogêneo
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
        <div>
          <span className="text-muted-foreground">Prioridade</span>
          <p className="font-bold">P{meta.tier}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Confiança</span>
          <p className="font-bold capitalize">{group.confidence}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Sugestão</span>
          <p className="font-bold">{group.suggestion ?? "—"}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Status</span>
          <p className="font-bold capitalize">{getGroupReviewStatus(group, decidedIds)}</p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{group.note}</p>

      {group.heterogeneous ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-2 whitespace-pre-line">
          ⚠ Grupo heterogêneo{"\n\n"}
          Os produtos deste grupo possuem características diferentes.{"\n"}
          A classificação deve ser feita individualmente.
          {group.heterogeneityReason ? `\n\n${group.heterogeneityReason}` : ""}
        </p>
      ) : null}

      <input
        value={observation}
        onChange={(e) => setObservation(e.target.value)}
        placeholder="Observação opcional (auditoria)…"
        className="h-8 w-full px-2 rounded-lg border text-xs"
      />

      <div className="max-h-48 overflow-y-auto space-y-1.5">
        {group.products.map((p) => {
          const done = decidedIds.has(p.reviewId);
          return (
            <label
              key={p.reviewId}
              className={`flex items-start gap-2 rounded-lg border p-2 text-xs ${
                done ? "bg-muted/40" : ""
              }`}
            >
              {!individualMode && !group.heterogeneous ? (
                <input
                  type="checkbox"
                  checked={!!selected[p.reviewId]}
                  onChange={(e) =>
                    setSelected((prev) => ({ ...prev, [p.reviewId]: e.target.checked }))
                  }
                  className="mt-0.5"
                />
              ) : null}
              <span className="flex-1">
                <span className="font-medium">{p.name}</span>
                <span className="block text-[10px] text-muted-foreground mt-0.5">
                  {p.internalCode ? `Cód. ${p.internalCode} · ` : ""}
                  {p.barcode && p.barcode !== "0" ? `EAN ${p.barcode} · ` : ""}
                  {p.price != null ? `R$ ${Number(p.price).toFixed(2)}` : ""}
                  {done ? " · decidido" : ""}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {confirmGroup ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
          <p className="text-xs font-semibold">
            Classificar {selectedCount || group.quantity} produto(s) como{" "}
            <span className="text-primary">{group.suggestion}</span>?
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onConfirmApprove} className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-bold">
              Confirmar
            </button>
            <button type="button" onClick={() => setConfirmGroup(false)} className="h-8 px-3 rounded-lg border text-xs font-bold">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!group.groupApprovalAllowed || !group.suggestion}
            onClick={onApprove}
            className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40"
          >
            Aprovar grupo
          </button>
          <select
            value={altCategory}
            onChange={(e) => setAltCategory(e.target.value as CatalogCategoryName | "")}
            disabled={group.heterogeneous}
            className="h-8 px-2 rounded-lg border text-xs disabled:opacity-40"
          >
            <option value="">Outra categoria…</option>
            {CATALOG_CATEGORY_NAMES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={group.heterogeneous || !altCategory}
            onClick={onApplyAlt}
            className="h-8 px-3 rounded-lg border text-xs font-bold disabled:opacity-40"
          >
            Aplicar
          </button>
          <button
            type="button"
            onClick={() => setIndividualMode(!individualMode)}
            className="h-8 px-3 rounded-lg border text-xs font-bold"
          >
            Revisar individualmente
          </button>
        </div>
      )}

      {individualMode ? (
        <div className="space-y-2 border-t pt-3">
          {group.products.map((p) => (
            <div key={p.reviewId} className="grid grid-cols-1 sm:grid-cols-[1fr_150px_auto] gap-2 items-center">
              <div>
                <p className="text-xs font-semibold">{p.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  Sugestão: {group.suggestion ?? "—"} · {group.note}
                </p>
              </div>
              <select
                className="h-8 px-2 rounded-lg border text-xs"
                defaultValue=""
                onChange={(e) => {
                  const v = e.target.value as CatalogCategoryName;
                  if (v) {
                    onIndividual(p, v);
                    toast.success(`→ ${v}`);
                  }
                }}
              >
                <option value="">Categoria…</option>
                {CATALOG_CATEGORY_NAMES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  onKeep(p);
                  toast.message("Mantido sem classificação");
                }}
                className="h-8 px-2 rounded-lg border text-[10px] font-bold"
              >
                Manter sem classificação
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}
