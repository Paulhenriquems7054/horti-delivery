import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Shield, RefreshCw, LogOut, Search, Loader2,
  Lock, Unlock, Plus, X, Clock, CheckCircle2, XCircle, Ban,
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
  active: { label: "Ativo", className: "bg-emerald-100 text-emerald-800" },
  trial: { label: "Trial", className: "bg-blue-100 text-blue-800" },
  blocked: { label: "Bloqueado", className: "bg-red-100 text-red-800" },
  cancelled: { label: "Cancelado", className: "bg-slate-200 text-slate-700" },
};

function publicError(message?: string) {
  const m = (message ?? "").toLowerCase();
  if (m.includes("not authorized") || m.includes("not authenticated")) return "Sem permissão para esta operação.";
  if (m.includes("slug")) return "Slug inválido ou já em uso.";
  if (m.includes("reason required")) return "Informe o motivo do bloqueio.";
  if (m.includes("invalid plan")) return "Plano inválido.";
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
  const [plan, setPlan] = useState(store.subscription_plan || "basic");
  const [expiresAt, setExpiresAt] = useState(
    store.subscription_expires_at ? store.subscription_expires_at.split("T")[0] : "",
  );
  const [blockReason, setBlockReason] = useState("");

  const status = STATUS_META[store.subscription_status] ?? STATUS_META.active;
  const blocked = store.subscription_status === "blocked";
  const expired = isExpired(store.subscription_expires_at);

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
    setBusy(true);
    const expires = expiresAt ? new Date(`${expiresAt}T00:00:00`).toISOString() : null;
    const { error } = await supabase.rpc("set_tenant_plan" as never, {
      p_store_id: store.id,
      p_plan: plan,
      p_expires_at: expires,
    } as never);
    setBusy(false);
    if (error) {
      toast.error(publicError(error.message));
      return;
    }
    toast.success("Plano atualizado.");
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

  return (
    <article className={`rounded-2xl border bg-white shadow-sm ${blocked ? "border-red-200" : "border-slate-200"}`}>
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-extrabold text-slate-900">{store.name}</h3>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${status.className}`}>{status.label}</span>
              {expired && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">EXPIRADO</span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">/{store.slug}</p>
          </div>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-slate-500">E-mail</dt>
            <dd className="font-medium text-slate-800 break-all">{store.email || "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Telefone</dt>
            <dd className="font-medium text-slate-800">{store.phone || "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Plano</dt>
            <dd className="font-medium text-slate-800">{PLAN_LABELS[store.subscription_plan] || store.subscription_plan}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Status da assinatura</dt>
            <dd className="font-medium text-slate-800">{status.label}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Fim do trial</dt>
            <dd className="font-medium text-slate-800">{formatDate(store.trial_ends_at)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Expira em</dt>
            <dd className="font-medium text-slate-800">{formatDate(store.subscription_expires_at)}</dd>
          </div>
        </dl>

        {blocked && store.blocked_reason && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            Motivo do bloqueio: {store.blocked_reason}
          </p>
        )}

        {store.user_id && (
          <p className="text-[11px] text-slate-400 font-mono break-all">user_id: {store.user_id}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPlanOpen(true)}
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

      {planOpen && (
        <Modal title="Alterar plano" onClose={() => setPlanOpen(false)}>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Plano
              <select value={plan} onChange={(e) => setPlan(e.target.value)} className="mt-1 w-full h-10 px-3 border rounded-lg">
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Data de expiração
              <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="mt-1 w-full h-10 px-3 border rounded-lg" />
            </label>
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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      toast.error("E-mail ou senha inválidos.");
      return;
    }
    const { data: isAdmin, error: rpcErr } = await supabase.rpc("is_platform_admin" as never);
    setBusy(false);
    if (rpcErr || isAdmin !== true) {
      await supabase.auth.signOut();
      toast.error("Esta conta não é operador da plataforma.");
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
            <div className="relative">
              <button
                type="button"
                onClick={() => void forgotPassword()}
                className="absolute -top-5 right-0 text-[10px] text-violet-300 font-bold hover:underline"
              >
                Esqueci minha senha
              </button>
              <input
                required
                type="email"
                placeholder="E-mail do operador"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-12 px-4 rounded-xl bg-slate-800 text-white border border-slate-700"
              />
            </div>
            <input
              required
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 px-4 rounded-xl bg-slate-800 text-white border border-slate-700"
            />
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
