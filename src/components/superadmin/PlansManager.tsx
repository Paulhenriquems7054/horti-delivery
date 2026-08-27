import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_SUBSCRIPTION_PLANS,
  PLAN_CODES,
  formatPlanPrice,
  isPlanCode,
  type SubscriptionPlan,
} from "@/lib/subscriptionPlans";

function mapRow(row: Record<string, unknown>): SubscriptionPlan | null {
  const code = String(row.code ?? "");
  if (!isPlanCode(code)) return null;
  return {
    code,
    name: String(row.name ?? code),
    price: Number(row.price ?? 0),
    currency: "BRL",
    billingPeriod: "monthly",
    maxUsers: Number(row.max_users ?? 0),
    isActive: Boolean(row.is_active),
  };
}

export function PlansManager() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>(DEFAULT_SUBSCRIPTION_PLANS);
  const [loading, setLoading] = useState(true);
  const [fromFallback, setFromFallback] = useState(false);
  const [editing, setEditing] = useState<SubscriptionPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [maxUsers, setMaxUsers] = useState("");
  const [isActive, setIsActive] = useState(true);

  const loadPlans = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_subscription_plans" as never);
    setLoading(false);
    if (error || !Array.isArray(data)) {
      setPlans(DEFAULT_SUBSCRIPTION_PLANS);
      setFromFallback(true);
      return;
    }
    const mapped = (data as Record<string, unknown>[])
      .map(mapRow)
      .filter((p): p is SubscriptionPlan => p !== null)
      .sort((a, b) => PLAN_CODES.indexOf(a.code) - PLAN_CODES.indexOf(b.code));
    if (mapped.length === 0) {
      setPlans(DEFAULT_SUBSCRIPTION_PLANS);
      setFromFallback(true);
      return;
    }
    setPlans(mapped);
    setFromFallback(false);
  };

  useEffect(() => {
    void loadPlans();
  }, []);

  const openEdit = (plan: SubscriptionPlan) => {
    setEditing(plan);
    setName(plan.name);
    setPrice(String(plan.price).replace(".", ","));
    setMaxUsers(String(plan.maxUsers));
    setIsActive(plan.isActive);
  };

  const save = async () => {
    if (!editing) return;
    const parsedPrice = Number(price.replace(",", "."));
    const parsedMax = Number(maxUsers);
    if (!name.trim()) {
      toast.error("Informe o nome do plano.");
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      toast.error("Informe um valor mensal válido.");
      return;
    }
    if (!Number.isInteger(parsedMax) || parsedMax < 1) {
      toast.error("O máximo de usuários deve ser um inteiro maior que zero.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("update_subscription_plan" as never, {
      p_code: editing.code,
      p_name: name.trim(),
      p_price: parsedPrice,
      p_max_users: parsedMax,
      p_is_active: isActive,
    } as never);
    setBusy(false);
    if (error) {
      toast.error("Não foi possível salvar. Aplique a migration local de planos no banco.");
      return;
    }
    toast.success("Plano atualizado.");
    setEditing(null);
    void loadPlans();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">Gerenciar planos</h2>
          <p className="text-sm text-slate-500 mt-1">
            Configuração comercial dos planos. Trocar o plano de uma loja não altera trial, status nem validade.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadPlans()}
          className="h-10 px-3 rounded-lg bg-white border text-sm font-bold inline-flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {fromFallback && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          Exibindo valores iniciais. A tabela `subscription_plans` ainda não está no Hosted. Salvar só funciona depois de aplicar a migration local.
        </p>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12 text-slate-500 gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando planos…
        </div>
      )}

      {!loading && (
        <div className="grid sm:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <article key={plan.code} className="rounded-2xl border bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{plan.code}</p>
                  <h3 className="text-xl font-extrabold text-slate-900">{plan.name}</h3>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${plan.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
                  {plan.isActive ? "Ativo" : "Inativo"}
                </span>
              </div>
              <p className="text-2xl font-extrabold text-slate-900">
                {formatPlanPrice(plan.price)}
                <span className="text-sm font-semibold text-slate-500"> / mês</span>
              </p>
              <p className="text-sm text-slate-600">Até {plan.maxUsers} usuários</p>
              <button
                type="button"
                onClick={() => openEdit(plan)}
                className="h-10 w-full rounded-lg bg-slate-900 text-white text-sm font-bold inline-flex items-center justify-center gap-2"
              >
                <Pencil className="h-4 w-4" /> Editar
              </button>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-5 space-y-3">
            <h3 className="font-extrabold text-slate-900">Editar plano {editing.name}</h3>
            <label className="block text-sm font-medium text-slate-700">
              Nome
              <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full h-10 px-3 border rounded-lg" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Valor mensal
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="mt-1 w-full h-10 px-3 border rounded-lg" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Máximo de usuários
              <input value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} inputMode="numeric" className="mt-1 w-full h-10 px-3 border rounded-lg" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Status
              <select value={isActive ? "active" : "inactive"} onChange={(e) => setIsActive(e.target.value === "active")} className="mt-1 w-full h-10 px-3 border rounded-lg">
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditing(null)} className="h-10 px-4 rounded-lg text-sm font-bold text-slate-600">Cancelar</button>
              <button type="button" disabled={busy} onClick={() => void save()} className="h-10 px-4 rounded-lg bg-violet-600 text-white text-sm font-bold disabled:opacity-60">
                {busy ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
