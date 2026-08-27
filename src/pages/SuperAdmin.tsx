import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Shield, RefreshCw, LogOut, Search, Loader2,
  Lock, Unlock, Plus, X, Clock, CheckCircle2, XCircle, Ban, Pencil,
} from "lucide-react";
import { toast } from "sonner";

interface Tenant {
  id: string;
  user_id?: string | null;
  name: string;
  slug: string;
  email?: string | null;
  phone?: string | null;
  description?: string | null;
  active: boolean;
  subscription_status: string;
  subscription_plan: string;
  subscription_expires_at?: string | null;
  trial_ends_at?: string | null;
  blocked_reason?: string | null;
  blocked_at?: string | null;
  created_at: string;
}

interface TenantEvent {
  id: string;
  event_type: string;
  notes?: string | null;
  created_at: string;
}

const PLAN_LABELS: Record<string, string> = {
  basic: "Basic",
  pro: "Pro",
  enterprise: "Enterprise",
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  active: { label: "ATIVO", className: "bg-emerald-100 text-emerald-800" },
  trial: { label: "TRIAL", className: "bg-blue-100 text-blue-800" },
  blocked: { label: "BLOQUEADO", className: "bg-red-100 text-red-800" },
  cancelled: { label: "CANCELADO", className: "bg-slate-200 text-slate-700" },
};

function slugOk(value: string) {
  return /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/.test(value);
}

function publicError(message?: string) {
  const m = (message ?? "").toLowerCase();
  if (m.includes("not authorized") || m.includes("not authenticated")) return "Sem permissão para esta operação.";
  if (m.includes("slug")) return "Slug inválido ou já em uso.";
  if (m.includes("reason required")) return "Informe o motivo do bloqueio.";
  if (m.includes("invalid plan")) return "Plano inválido.";
  if (m.includes("expiry must be in the future")) return "Para converter o trial, informe uma data futura da assinatura.";
  if (m.includes("store not found")) return "Loja não encontrada.";
  if (m.includes("email already") || m.includes("already registered")) return "Este e-mail já está cadastrado.";
  if (m.includes("failed to send") || m.includes("not found") || m.includes("functions")) {
    return "Não foi possível provisionar. A função ainda pode não estar publicada.";
  }
  return "Não foi possível concluir a operação.";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

function isExpired(iso?: string | null) {
  return Boolean(iso && new Date(iso) < new Date());
}

/** EXPIRADO segue a data do estado comercial, não mistura trial com assinatura paga. */
function isTermExpired(store: Tenant) {
  if (store.subscription_status === "trial") return isExpired(store.trial_ends_at);
  if (store.subscription_status === "active") return isExpired(store.subscription_expires_at);
  return false;
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-extrabold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function TenantCard({ store, onRefresh }: { store: Tenant; onRefresh: () => void }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [events, setEvents] = useState<TenantEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [unblockOpen, setUnblockOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(store.name);
  const [editSlug, setEditSlug] = useState(store.slug);
  const [editEmail, setEditEmail] = useState(store.email ?? "");
  const [editPhone, setEditPhone] = useState(store.phone ?? "");
  const [editDescription, setEditDescription] = useState(store.description ?? "");
  const [editError, setEditError] = useState<string | null>(null);
  const [plan, setPlan] = useState(store.subscription_plan || "basic");
  const [expiresAt, setExpiresAt] = useState("");
  const [blockReason, setBlockReason] = useState("");

  const openPlanModal = () => {
    setPlan(store.subscription_plan || "basic");
    setExpiresAt(
      store.subscription_status === "trial"
        ? ""
        : store.subscription_expires_at
          ? store.subscription_expires_at.split("T")[0]
          : "",
    );
    setPlanOpen(true);
  };

  const status = STATUS_META[store.subscription_status] ?? STATUS_META.active;
  const blocked = store.subscription_status === "blocked";
  const operationalBlocked = blocked || store.active === false;
  const expired = isTermExpired(store);

  const loadEvents = async () => {
    setEventsLoading(true);
    setEventsError(null);
    const { data, error } = await supabase.rpc("list_tenant_events" as never, {
      p_store_id: store.id,
    } as never);
    setEventsLoading(false);
    if (error) {
      setEvents([]);
      setEventsError(publicError(error.message));
      return;
    }
    setEvents((data as TenantEvent[]) ?? []);
  };

  const toggleHistory = () => {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next) void loadEvents();
  };

  const savePlan = async () => {
    if (!["basic", "pro", "enterprise"].includes(plan)) {
      toast.error("Plano inválido.");
      return;
    }
    const expires = expiresAt ? new Date(`${expiresAt}T00:00:00`) : null;
    if (expires && Number.isNaN(expires.getTime())) {
      toast.error("Data de expiração inválida.");
      return;
    }
    if (store.subscription_status === "trial" && expires && expires <= new Date()) {
      toast.error("Para converter o trial, informe uma data futura da assinatura.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("set_tenant_plan" as never, {
      p_store_id: store.id,
      p_plan: plan,
      p_expires_at: expires ? expires.toISOString() : null,
    } as never);
    setBusy(false);
    if (error) {
      toast.error(publicError(error.message));
      return;
    }
    toast.success("Plano atualizado com sucesso.");
    setPlanOpen(false);
    onRefresh();
  };

  const confirmBlock = async () => {
    if (!blockReason.trim()) {
      toast.error("Informe o motivo do bloqueio.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("set_tenant_status" as never, {
      p_store_id: store.id,
      p_active: false,
      p_reason: blockReason.trim(),
    } as never);
    setBusy(false);
    if (error) {
      toast.error(publicError(error.message));
      return;
    }
    toast.success("Loja bloqueada.");
    setBlockReason("");
    setBlockOpen(false);
    onRefresh();
  };

  const confirmUnblock = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("set_tenant_status" as never, {
      p_store_id: store.id,
      p_active: true,
      p_reason: null,
    } as never);
    setBusy(false);
    if (error) {
      toast.error(publicError(error.message));
      return;
    }
    toast.success("Loja desbloqueada.");
    setUnblockOpen(false);
    onRefresh();
  };

  const openEdit = () => {
    setEditName(store.name);
    setEditSlug(store.slug);
    setEditEmail(store.email ?? "");
    setEditPhone(store.phone ?? "");
    setEditDescription(store.description ?? "");
    setEditError(null);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    const name = editName.trim();
    const slug = editSlug.trim().toLowerCase();
    if (name.length < 2) {
      setEditError("Informe o nome da loja.");
      return;
    }
    if (!slugOk(slug)) {
      setEditError("Slug inválido. Use letras minúsculas, números e hífen.");
      return;
    }
    if (slug !== store.slug) {
      const ok = window.confirm(
        `Alterar o slug de /${store.slug} para /${slug} quebra o link público antigo. Continuar?`,
      );
      if (!ok) return;
    }
    setBusy(true);
    setEditError(null);
    const { error } = await supabase.rpc("update_tenant" as never, {
      p_store_id: store.id,
      p_name: name,
      p_slug: slug,
      p_email: editEmail.trim() || null,
      p_phone: editPhone.trim() || null,
      p_description: editDescription.trim() || null,
    } as never);
    setBusy(false);
    if (error) {
      const msg = (error.message || "").toLowerCase().includes("could not find")
        || (error.message || "").toLowerCase().includes("does not exist")
        || (error.message || "").toLowerCase().includes("schema cache")
        ? "A RPC update_tenant ainda não está aplicada no Hosted."
        : publicError(error.message);
      setEditError(msg);
      toast.error(msg);
      return;
    }
    toast.success("Cliente atualizado.");
    setEditOpen(false);
    onRefresh();
  };

  return (
    <article className={`rounded-2xl border bg-white shadow-sm ${blocked ? "border-red-200" : "border-slate-200"}`}>
      <div className="p-5 space-y-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Identificação</p>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <h3 className="text-lg font-extrabold text-slate-900">{store.name}</h3>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${status.className}`}>{status.label}</span>
            {expired && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">EXPIRADO</span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">/{store.slug}</p>
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Contato da loja</p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm mt-1">
            <div>
              <dt className="text-slate-500">E-mail de contato</dt>
              <dd className="font-medium text-slate-800 break-all">{store.email || "Não informado"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Telefone</dt>
              <dd className="font-medium text-slate-800">{store.phone || "Não informado"}</dd>
            </div>
          </dl>
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Assinatura</p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm mt-1">
            <div>
              <dt className="text-slate-500">Plano</dt>
              <dd className="font-medium text-slate-800">{PLAN_LABELS[store.subscription_plan] || store.subscription_plan}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Status da assinatura</dt>
              <dd className="font-medium text-slate-800">{status.label}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Estado operacional</dt>
              <dd className="font-medium text-slate-800">{operationalBlocked ? "BLOQUEADO" : "ATIVO"}</dd>
            </div>
            {store.subscription_status === "trial" && (
              <div>
                <dt className="text-slate-500">Fim do trial</dt>
                <dd className="font-medium text-slate-800">
                  {formatDate(store.trial_ends_at)}
                  {isExpired(store.trial_ends_at) && (
                    <span className="ml-2 text-[11px] font-bold text-amber-700">EXPIRADO</span>
                  )}
                </dd>
              </div>
            )}
            {store.subscription_status === "active" && (
              <div>
                <dt className="text-slate-500">Assinatura expira em</dt>
                <dd className="font-medium text-slate-800">
                  {formatDate(store.subscription_expires_at)}
                  {isExpired(store.subscription_expires_at) && (
                    <span className="ml-2 text-[11px] font-bold text-amber-700">EXPIRADO</span>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {blocked && store.blocked_reason && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            Motivo do bloqueio: {store.blocked_reason}
          </p>
        )}

        {store.user_id && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Identificação técnica</p>
            <p className="text-[11px] text-slate-400 font-mono break-all mt-1">user_id: {store.user_id}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openEdit}
            className="h-9 px-3 rounded-lg bg-slate-800 text-white text-xs font-bold hover:bg-slate-700 inline-flex items-center gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" /> Editar
          </button>
          <button
            type="button"
            onClick={openPlanModal}
            className="h-9 px-3 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700"
          >
            Alterar plano
          </button>
          {blocked ? (
            <button
              type="button"
              onClick={() => setUnblockOpen(true)}
              className="h-9 px-3 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 inline-flex items-center gap-1.5"
            >
              <Unlock className="h-3.5 w-3.5" /> Desbloquear
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setBlockOpen(true)}
              className="h-9 px-3 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 inline-flex items-center gap-1.5"
            >
              <Lock className="h-3.5 w-3.5" /> Bloquear loja
            </button>
          )}
        </div>

        <div className="border-t pt-3">
          <button type="button" onClick={toggleHistory} className="text-sm font-bold text-slate-700 hover:text-violet-700">
            {historyOpen ? "Ocultar histórico" : "Histórico"}
          </button>
          {historyOpen && (
            <div className="mt-3">
              {eventsLoading && (
                <p className="text-sm text-slate-500 inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico…
                </p>
              )}
              {eventsError && <p className="text-sm text-red-600">{eventsError}</p>}
              {!eventsLoading && !eventsError && events.length === 0 && (
                <p className="text-sm text-slate-500">Nenhum evento registrado.</p>
              )}
              {!eventsLoading && events.length > 0 && (
                <ol className="space-y-2">
                  {events.map((ev) => (
                    <li key={ev.id} className="text-sm border-l-2 border-violet-200 pl-3">
                      <p className="text-xs text-slate-500">{formatDateTime(ev.created_at)}</p>
                      <p className="font-semibold text-slate-800">{ev.event_type}</p>
                      {ev.notes && <p className="text-slate-600">{ev.notes}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      </div>

      {editOpen && (
        <Modal title="Editar cliente" onClose={() => setEditOpen(false)}>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Nome da loja
              <input value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-1 w-full h-10 px-3 border rounded-lg" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Slug
              <input value={editSlug} onChange={(e) => setEditSlug(e.target.value.toLowerCase())} className="mt-1 w-full h-10 px-3 border rounded-lg" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              E-mail de contato da loja
              <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="mt-1 w-full h-10 px-3 border rounded-lg" />
            </label>
            <p className="text-xs text-slate-500">Este e-mail é de contato da loja. Não altera o e-mail de login do administrador.</p>
            <label className="block text-sm font-medium text-slate-700">
              Telefone
              <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="mt-1 w-full h-10 px-3 border rounded-lg" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Descrição
              <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="mt-1 w-full min-h-[72px] px-3 py-2 border rounded-lg" />
            </label>
            {editError && <p className="text-sm text-red-600">{editError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditOpen(false)} className="h-10 px-4 rounded-lg text-sm font-bold text-slate-600">Cancelar</button>
              <button type="button" disabled={busy} onClick={() => void saveEdit()} className="h-10 px-4 rounded-lg bg-slate-900 text-white text-sm font-bold disabled:opacity-60">
                {busy ? "Salvando…" : "Salvar alterações"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {planOpen && (
        <Modal title="Alterar plano" onClose={() => setPlanOpen(false)}>
          <div className="space-y-3">
            <div className="text-sm bg-slate-50 rounded-xl p-3 space-y-1">
              <p><span className="text-slate-500">Loja:</span> <strong>{store.name}</strong></p>
              <p><span className="text-slate-500">Plano atual:</span> {PLAN_LABELS[store.subscription_plan] || store.subscription_plan}</p>
              <p><span className="text-slate-500">Status atual:</span> {status.label}</p>
              {store.subscription_status === "trial" && (
                <p><span className="text-slate-500">Fim do trial:</span> {formatDate(store.trial_ends_at)}</p>
              )}
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Novo plano
              <select value={plan} onChange={(e) => setPlan(e.target.value)} className="mt-1 w-full h-10 px-3 border rounded-lg">
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Data de expiração da assinatura
              <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="mt-1 w-full h-10 px-3 border rounded-lg" />
            </label>
            {store.subscription_status === "trial" && (
              <p className="text-xs text-slate-500">
                Deixe a data vazia para manter o trial (só troca o plano). Informe uma data futura para converter em assinatura paga. O fim do trial não é apagado. Data residual antiga não converte o cliente.
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setPlanOpen(false)} className="h-10 px-4 rounded-lg text-sm font-bold text-slate-600">Cancelar</button>
              <button type="button" disabled={busy} onClick={savePlan} className="h-10 px-4 rounded-lg bg-violet-600 text-white text-sm font-bold disabled:opacity-60">
                {busy ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {blockOpen && (
        <Modal title="Bloquear loja" onClose={() => setBlockOpen(false)}>
          <div className="space-y-3">
            <div className="text-sm bg-slate-50 rounded-xl p-3 space-y-1">
              <p><span className="text-slate-500">Loja:</span> <strong>{store.name}</strong></p>
              <p><span className="text-slate-500">Slug:</span> /{store.slug}</p>
              <p><span className="text-slate-500">Status:</span> {status.label}</p>
              <p><span className="text-slate-500">Plano:</span> {PLAN_LABELS[store.subscription_plan] || store.subscription_plan}</p>
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Motivo do bloqueio
              <textarea
                required
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                className="mt-1 w-full min-h-[88px] px-3 py-2 border rounded-lg"
                placeholder="Obrigatório"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setBlockOpen(false)} className="h-10 px-4 rounded-lg text-sm font-bold text-slate-600">Cancelar</button>
              <button type="button" disabled={busy || !blockReason.trim()} onClick={confirmBlock} className="h-10 px-4 rounded-lg bg-red-600 text-white text-sm font-bold disabled:opacity-60">
                {busy ? "Bloqueando…" : "Confirmar bloqueio"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {unblockOpen && (
        <Modal title="Desbloquear loja" onClose={() => setUnblockOpen(false)}>
          <p className="text-sm text-slate-600">
            Confirmar desbloqueio de <strong>{store.name}</strong> (/{store.slug})?
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={() => setUnblockOpen(false)} className="h-10 px-4 rounded-lg text-sm font-bold text-slate-600">Cancelar</button>
            <button type="button" disabled={busy} onClick={confirmUnblock} className="h-10 px-4 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-60">
              {busy ? "Desbloqueando…" : "Confirmar desbloqueio"}
            </button>
          </div>
        </Modal>
      )}
    </article>
  );
}

function NewClientModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [slug, setSlug] = useState("");
  const [plan, setPlan] = useState("basic");
  const [password, setPassword] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("provision-tenant", {
      body: {
        email,
        password,
        name: storeName,
        slug,
        phone: phone || null,
        plan,
      },
    });
    setBusy(false);
    if (error) {
      toast.error(publicError(error.message));
      return;
    }
    if (data && typeof data === "object" && "error" in data && data.error) {
      toast.error(publicError(String((data as { error: string }).error)));
      return;
    }
    toast.success("Cliente criado.");
    onClose();
    onDone();
  };

  return (
    <Modal title="Novo cliente" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <input required minLength={2} placeholder="Nome da loja" value={storeName} onChange={(e) => setStoreName(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm" />
        <input placeholder="Nome do responsável" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm" />
        <input required type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm" />
        <input placeholder="Telefone" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm" />
        <input required placeholder="Slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} className="w-full h-10 px-3 border rounded-lg text-sm" />
        <select value={plan} onChange={(e) => setPlan(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm">
          <option value="basic">Basic</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <input required minLength={6} type="password" placeholder="Senha inicial" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm" />
        <p className="text-xs text-slate-500">A senha não será exibida novamente após a criação.</p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg text-sm font-bold text-slate-600">Cancelar</button>
          <button type="submit" disabled={busy} className="h-10 px-4 rounded-lg bg-violet-600 text-white text-sm font-bold disabled:opacity-60">
            {busy ? "Criando…" : "Criar cliente"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function OperatorLogin({
  onSuccess,
  notice,
}: {
  onSuccess: () => void;
  notice?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(
    () => typeof window !== "undefined" && window.location.hash.includes("type=recovery"),
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      setBusy(false);
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("invalid") || msg.includes("invalid login")) {
        toast.error("E-mail ou senha inválidos. Confirme se o usuário existe no Auth deste projeto.");
      } else if (msg.includes("confirm")) {
        toast.error("E-mail ainda não confirmado no Auth.");
      } else {
        toast.error(error.message);
      }
      return;
    }
    const { data: isAdmin, error: rpcErr } = await supabase.rpc("is_platform_admin" as never);
    setBusy(false);
    if (rpcErr) {
      await supabase.auth.signOut();
      toast.error("Login ok, mas is_platform_admin falhou. A migration da Super Admin pode não estar neste projeto.");
      return;
    }
    if (isAdmin !== true) {
      await supabase.auth.signOut();
      toast.error("Senha correta, mas este e-mail não está em platform_admins.");
      return;
    }
    onSuccess();
  };

  const forgotPassword = async () => {
    if (!email.trim()) {
      toast.error("Digite o e-mail primeiro para enviarmos o link de recuperação.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/superadmin`,
    });
    setBusy(false);
    if (error) toast.error(error.message || "Não foi possível enviar o e-mail.");
    else toast.success("E-mail de recuperação enviado. Verifique sua caixa de entrada.");
  };

  const saveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) {
      toast.error(error.message || "Não foi possível atualizar a senha.");
      return;
    }
    toast.success("Senha atualizada. Entre com a nova senha.");
    setResetting(false);
    setPassword("");
    setNewPassword("");
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <form onSubmit={resetting ? saveNewPassword : submit} className="w-full max-w-sm space-y-4">
        <div className="text-center space-y-2">
          <div className="h-14 w-14 rounded-2xl bg-violet-600 flex items-center justify-center mx-auto">
            <Shield className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-white">Super Admin</h1>
          <p className="text-sm text-slate-400">
            {resetting ? "Defina a nova senha de acesso." : "Acesso exclusivo do operador da plataforma."}
          </p>
        </div>
        {notice && !resetting && <p className="text-sm text-amber-300 text-center">{notice}</p>}

        {resetting ? (
          <>
            <input
              required
              minLength={6}
              type="password"
              placeholder="Nova senha"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full h-12 px-4 rounded-xl bg-slate-800 text-white border border-slate-700"
            />
            <button type="submit" disabled={busy} className="w-full h-12 rounded-xl bg-violet-600 text-white font-bold disabled:opacity-60">
              {busy ? "Salvando…" : "Salvar nova senha"}
            </button>
            <button
              type="button"
              onClick={() => setResetting(false)}
              className="w-full text-xs text-slate-400 hover:text-white font-bold"
            >
              Cancelar e voltar
            </button>
          </>
        ) : (
          <>
            <input
              required
              type="email"
              placeholder="E-mail do operador"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 px-4 rounded-xl bg-slate-800 text-white border border-slate-700"
            />
            <input
              required
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 px-4 rounded-xl bg-slate-800 text-white border border-slate-700"
            />
            <button
              type="button"
              onClick={() => void forgotPassword()}
              className="w-full text-right text-[10px] text-violet-300 font-bold hover:underline"
            >
              Esqueci minha senha
            </button>
            <button type="submit" disabled={busy} className="w-full h-12 rounded-xl bg-violet-600 text-white font-bold disabled:opacity-60">
              {busy ? "Entrando…" : "Entrar"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

export default function SuperAdmin() {
  const [gate, setGate] = useState<"loading" | "login" | "ok">("loading");
  const [gateNotice, setGateNotice] = useState<string | null>(null);
  const [stores, setStores] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [newOpen, setNewOpen] = useState(false);

  const resolveGate = async () => {
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
      setGate("login");
      setGateNotice(null);
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setGate("login");
      setGateNotice(null);
      return;
    }
    const { data: isAdmin, error } = await supabase.rpc("is_platform_admin" as never);
    if (error) {
      setGate("login");
      setGateNotice("Não foi possível verificar a permissão de operador. Confirme se a migration da Super Admin está aplicada.");
      return;
    }
    if (isAdmin === true) {
      setGate("ok");
      return;
    }
    await supabase.auth.signOut();
    setGate("login");
    setGateNotice("Esta sessão não é de operador. Entre com uma conta cadastrada em platform_admins.");
  };

  useEffect(() => {
    void resolveGate();
  }, []);

  const loadStores = async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase.rpc("list_tenants" as never);
    setLoading(false);
    if (error) {
      setStores([]);
      setLoadError("Não foi possível carregar os clientes.");
      return;
    }
    setStores((data as Tenant[]) ?? []);
  };

  useEffect(() => {
    if (gate === "ok") void loadStores();
  }, [gate]);

  const counts = useMemo(() => ({
    all: stores.length,
    active: stores.filter((s) => s.subscription_status === "active").length,
    trial: stores.filter((s) => s.subscription_status === "trial").length,
    blocked: stores.filter((s) => s.subscription_status === "blocked").length,
    cancelled: stores.filter((s) => s.subscription_status === "cancelled").length,
  }), [stores]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stores.filter((s) => {
      const matchQ = !q
        || s.name.toLowerCase().includes(q)
        || s.slug.toLowerCase().includes(q)
        || (s.email ?? "").toLowerCase().includes(q)
        || (s.phone ?? "").toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || s.subscription_status === statusFilter;
      const matchPlan = planFilter === "all" || s.subscription_plan === planFilter;
      return matchQ && matchStatus && matchPlan;
    });
  }, [stores, search, statusFilter, planFilter]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setGate("login");
    setGateNotice(null);
    setStores([]);
  };

  const kpis = [
    { key: "all", label: "Total", count: counts.all, icon: Shield },
    { key: "active", label: "Ativos", count: counts.active, icon: CheckCircle2 },
    { key: "trial", label: "Trial", count: counts.trial, icon: Clock },
    { key: "blocked", label: "Bloqueados", count: counts.blocked, icon: Ban },
    { key: "cancelled", label: "Cancelados", count: counts.cancelled, icon: XCircle },
  ];

  if (gate === "loading") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
      </div>
    );
  }

  if (gate !== "ok") {
    return <OperatorLogin onSuccess={() => { setGate("ok"); setGateNotice(null); }} notice={gateNotice} />;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-4 py-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xl font-extrabold">Super Admin</p>
            <p className="text-sm text-slate-300 mt-1">Administração da plataforma e gerenciamento dos lojistas.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void loadStores()} className="h-10 px-3 rounded-lg bg-slate-800 text-sm font-bold inline-flex items-center gap-2 hover:bg-slate-700">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </button>
            <button type="button" onClick={() => void handleLogout()} className="h-10 px-3 rounded-lg bg-slate-800 text-sm font-bold inline-flex items-center gap-2 hover:bg-slate-700">
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {kpis.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => setStatusFilter(k.key)}
              className={`rounded-2xl p-4 text-left border ${statusFilter === k.key ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-800 border-slate-200"}`}
            >
              <k.icon className="h-4 w-4 mb-2 opacity-70" />
              <p className="text-2xl font-extrabold">{k.count}</p>
              <p className="text-xs font-semibold opacity-80">{k.label}</p>
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, slug, e-mail ou telefone"
              className="w-full h-11 pl-10 pr-3 rounded-xl border border-slate-200 bg-white text-sm"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm">
            <option value="all">Status: Todos</option>
            <option value="active">Ativo</option>
            <option value="trial">Trial</option>
            <option value="blocked">Bloqueado</option>
            <option value="cancelled">Cancelado</option>
          </select>
          <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className="h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm">
            <option value="all">Plano: Todos</option>
            <option value="basic">Basic</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <button type="button" onClick={() => setNewOpen(true)} className="h-11 px-4 rounded-xl bg-violet-700 text-white text-sm font-bold inline-flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" /> Novo cliente
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16 text-slate-500 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando clientes…
          </div>
        )}

        {!loading && loadError && (
          <div className="text-center py-16 space-y-3">
            <p className="text-slate-700">{loadError}</p>
            <button type="button" onClick={() => void loadStores()} className="h-10 px-4 rounded-lg bg-slate-900 text-white text-sm font-bold">
              Tentar novamente
            </button>
          </div>
        )}

        {!loading && !loadError && stores.length === 0 && (
          <p className="text-center py-16 text-slate-500">Nenhum cliente cadastrado.</p>
        )}

        {!loading && !loadError && stores.length > 0 && filtered.length === 0 && (
          <p className="text-center py-16 text-slate-500">Nenhum cliente corresponde aos filtros.</p>
        )}

        {!loading && !loadError && (
          <div className="space-y-4">
            {filtered.map((store) => (
              <TenantCard key={store.id} store={store} onRefresh={loadStores} />
            ))}
          </div>
        )}
      </main>

      {newOpen && <NewClientModal onClose={() => setNewOpen(false)} onDone={loadStores} />}
    </div>
  );
}
