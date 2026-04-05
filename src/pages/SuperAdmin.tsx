import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import {
  Shield, Users, Lock, Unlock, RefreshCw, LogOut,
  CheckCircle2, XCircle, Clock, AlertTriangle, Search,
  ChevronDown, ChevronUp, Loader2,
} from "lucide-react";
import { toast } from "sonner";

// ─── Superadmin PIN — lido de variável de ambiente ───────────────────────────
// Defina VITE_SUPER_PIN no .env e no Vercel (Settings > Environment Variables)
// NUNCA commite a senha real aqui
const SUPER_PIN = import.meta.env.VITE_SUPER_PIN ?? "dev2025";

interface Store {
  id: string;
  name: string;
  slug: string;
  email?: string;
  phone?: string;
  active: boolean;
  subscription_status: string;
  subscription_plan: string;
  subscription_expires_at?: string;
  trial_ends_at?: string;
  blocked_reason?: string;
  blocked_at?: string;
  created_at: string;
  user_id?: string;
}

interface SubEvent {
  id: string;
  event_type: string;
  notes?: string;
  created_at: string;
}

const PLAN_LABELS: Record<string, string> = {
  basic: "Básico",
  pro: "Pro",
  enterprise: "Enterprise",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  active:    { label: "Ativo",      color: "text-emerald-700", bg: "bg-emerald-100", icon: CheckCircle2 },
  trial:     { label: "Trial",      color: "text-blue-700",    bg: "bg-blue-100",    icon: Clock        },
  blocked:   { label: "Bloqueado",  color: "text-red-700",     bg: "bg-red-100",     icon: XCircle      },
  cancelled: { label: "Cancelado",  color: "text-slate-600",   bg: "bg-slate-100",   icon: XCircle      },
};

// ─── PIN Screen ───────────────────────────────────────────────────────────────
function PinScreen({ onUnlock }: { onUnlock: () => void }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input === SUPER_PIN) {
      onUnlock();
    } else {
      setError(true);
      setInput("");
      setTimeout(() => setError(false), 2000);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!resetEmail.trim()) {
      toast.error("Digite seu email");
      return;
    }

    setResetLoading(true);
    
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/superadmin`,
      });

      if (error) throw error;

      setResetSent(true);
      toast.success("Email de recuperação enviado! Verifique sua caixa de entrada.");
      
      setTimeout(() => {
        setShowForgotPassword(false);
        setResetSent(false);
        setResetEmail("");
      }, 3000);
    } catch (error: any) {
      toast.error(error.message || "Erro ao enviar email de recuperação");
    } finally {
      setResetLoading(false);
    }
  };

  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="h-16 w-16 rounded-2xl bg-violet-600 flex items-center justify-center shadow-lg">
            <Shield className="h-9 w-9 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-white">Recuperar Senha</h1>
          <p className="text-slate-400 text-sm text-center max-w-sm">
            Digite seu email para receber um link de recuperação de senha
          </p>
        </div>

        {resetSent ? (
          <div className="w-full max-w-xs space-y-4 text-center">
            <div className="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            </div>
            <p className="text-emerald-400 font-semibold">Email enviado com sucesso!</p>
            <p className="text-slate-400 text-sm">Verifique sua caixa de entrada e spam</p>
          </div>
        ) : (
          <form onSubmit={handleForgotPassword} className="w-full max-w-xs space-y-3">
            <input
              type="email"
              placeholder="seu@email.com"
              value={resetEmail}
              onChange={e => setResetEmail(e.target.value)}
              autoFocus
              className="w-full h-12 px-4 rounded-xl bg-slate-800 text-white border border-slate-700 focus:outline-none focus:border-violet-500"
            />
            <button 
              type="submit" 
              disabled={resetLoading}
              className="w-full h-12 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {resetLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviar Link de Recuperação"
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowForgotPassword(false)}
              className="w-full h-12 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-colors"
            >
              Voltar ao Login
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="h-16 w-16 rounded-2xl bg-violet-600 flex items-center justify-center shadow-lg">
          <Shield className="h-9 w-9 text-white" />
        </div>
        <h1 className="text-2xl font-extrabold text-white">Painel do Desenvolvedor</h1>
        <p className="text-slate-400 text-sm">Acesso restrito</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-3">
        <input
          type="password"
          placeholder="Senha de acesso"
          value={input}
          onChange={e => setInput(e.target.value)}
          autoFocus
          className={`w-full h-12 px-4 rounded-xl bg-slate-800 text-white border ${error ? "border-red-500" : "border-slate-700"} focus:outline-none focus:border-violet-500`}
        />
        {error && <p className="text-red-400 text-sm text-center">Senha incorreta</p>}
        <button type="submit" className="w-full h-12 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold transition-colors">
          Entrar
        </button>
        <button
          type="button"
          onClick={() => setShowForgotPassword(true)}
          className="w-full text-violet-400 hover:text-violet-300 text-sm font-semibold transition-colors"
        >
          Esqueci minha senha
        </button>
      </form>
    </div>
  );
}

// ─── Store Card ───────────────────────────────────────────────────────────────
function StoreCard({ store, onRefresh }: { store: Store; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState<SubEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [plan, setPlan] = useState(store.subscription_plan || "basic");
  const [expiresAt, setExpiresAt] = useState(
    store.subscription_expires_at ? store.subscription_expires_at.split("T")[0] : ""
  );

  const st = STATUS_CONFIG[store.subscription_status] ?? STATUS_CONFIG.active;
  const StatusIcon = st.icon;

  const loadEvents = async () => {
    const { data } = await (supabase as any)
      .from("subscription_events")
      .select("*")
      .eq("store_id", store.id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) setEvents(data);
  };

  const handleToggle = () => {
    setExpanded(v => !v);
    if (!expanded) loadEvents();
  };

  const logEvent = async (type: string, notes?: string) => {
    await (supabase as any).from("subscription_events").insert({
      store_id: store.id,
      event_type: type,
      notes,
      created_by: "developer",
    });
  };

  const handleBlock = async () => {
    if (!blockReason.trim()) { toast.error("Informe o motivo do bloqueio"); return; }
    setLoading(true);
    await (supabase as any).from("stores").update({
      subscription_status: "blocked",
      active: false,
      blocked_reason: blockReason,
      blocked_at: new Date().toISOString(),
    }).eq("id", store.id);
    await logEvent("blocked", blockReason);
    toast.success("Loja bloqueada");
    setBlockReason("");
    setLoading(false);
    onRefresh();
  };

  const handleUnblock = async () => {
    setLoading(true);
    await (supabase as any).from("stores").update({
      subscription_status: "active",
      active: true,
      blocked_reason: null,
      blocked_at: null,
    }).eq("id", store.id);
    await logEvent("unblocked", "Desbloqueio manual pelo desenvolvedor");
    toast.success("Loja desbloqueada");
    setLoading(false);
    onRefresh();
  };

  const handleSavePlan = async () => {
    setLoading(true);
    await (supabase as any).from("stores").update({
      subscription_plan: plan,
      subscription_expires_at: expiresAt || null,
    }).eq("id", store.id);
    await logEvent("plan_changed", `Plano alterado para ${plan}`);
    toast.success("Plano atualizado");
    setLoading(false);
    onRefresh();
  };

  const isBlocked = store.subscription_status === "blocked";
  const isExpired = store.subscription_expires_at && new Date(store.subscription_expires_at) < new Date();

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-sm ${isBlocked ? "border-red-200 bg-red-50/30" : "bg-white border-slate-200"}`}>
      {/* Header */}
      <div className="p-4 flex items-start gap-3">
        <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${st.bg}`}>
          <StatusIcon className={`h-5 w-5 ${st.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-extrabold text-foreground">{store.name}</h3>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${st.bg} ${st.color}`}>{st.label}</span>
            {isExpired && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Expirado</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">/{store.slug} • {PLAN_LABELS[store.subscription_plan] || store.subscription_plan}</p>
          {store.email && <p className="text-xs text-muted-foreground">{store.email}</p>}
          {store.blocked_reason && (
            <p className="text-xs text-red-600 mt-1 font-semibold">🔒 {store.blocked_reason}</p>
          )}
          {store.subscription_expires_at && (
            <p className={`text-xs mt-0.5 ${isExpired ? "text-red-600 font-bold" : "text-muted-foreground"}`}>
              Expira: {new Date(store.subscription_expires_at).toLocaleDateString("pt-BR")}
            </p>
          )}
        </div>
        <button onClick={handleToggle} className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="border-t bg-slate-50/50 p-4 space-y-4">
          {/* Plano e validade */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Plano & Validade</p>
            <div className="flex gap-2">
              <select
                value={plan}
                onChange={e => setPlan(e.target.value)}
                className="flex-1 h-9 px-3 border border-border rounded-lg text-sm bg-white"
              >
                <option value="basic">Básico</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
              <input
                type="date"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                className="flex-1 h-9 px-3 border border-border rounded-lg text-sm bg-white"
              />
              <button
                onClick={handleSavePlan}
                disabled={loading}
                className="h-9 px-3 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-60"
              >
                Salvar
              </button>
            </div>
          </div>

          {/* Bloquear / Desbloquear */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Controle de Acesso</p>
            {isBlocked ? (
              <button
                onClick={handleUnblock}
                disabled={loading}
                className="w-full h-10 rounded-xl bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-emerald-600 disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Unlock className="h-4 w-4" /> Desbloquear Loja</>}
              </button>
            ) : (
              <div className="flex gap-2">
                <input
                  placeholder="Motivo do bloqueio (ex: inadimplência)"
                  value={blockReason}
                  onChange={e => setBlockReason(e.target.value)}
                  className="flex-1 h-9 px-3 border border-border rounded-lg text-sm bg-white"
                />
                <button
                  onClick={handleBlock}
                  disabled={loading || !blockReason.trim()}
                  className="h-9 px-3 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600 disabled:opacity-60 flex items-center gap-1.5"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Lock className="h-3.5 w-3.5" /> Bloquear</>}
                </button>
              </div>
            )}
          </div>

          {/* Histórico */}
          {events.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Histórico</p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {events.map(ev => (
                  <div key={ev.id} className="flex items-start gap-2 text-xs bg-white p-2 rounded-lg border border-slate-100">
                    <span className="font-mono text-muted-foreground shrink-0">{new Date(ev.created_at).toLocaleDateString("pt-BR")}</span>
                    <span className="font-bold text-foreground">{ev.event_type}</span>
                    {ev.notes && <span className="text-muted-foreground truncate">{ev.notes}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SuperAdmin() {
  const [unlocked, setUnlocked] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const navigate = useNavigate();

  const loadStores = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("stores")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setStores(data);
    setLoading(false);
  };

  useEffect(() => {
    if (unlocked) loadStores();
  }, [unlocked]);

  if (!unlocked) return <PinScreen onUnlock={() => setUnlocked(true)} />;

  const filtered = stores.filter(s => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.slug.includes(search.toLowerCase()) || s.email?.includes(search);
    const matchStatus = filterStatus === "all" || s.subscription_status === filterStatus;
    return matchSearch && matchStatus;
  });

  const counts = {
    all: stores.length,
    active: stores.filter(s => s.subscription_status === "active").length,
    trial: stores.filter(s => s.subscription_status === "trial").length,
    blocked: stores.filter(s => s.subscription_status === "blocked").length,
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="bg-violet-700 px-4 py-4 sticky top-0 z-10 shadow-lg">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-white" />
            <div>
              <h1 className="text-base font-extrabold text-white">Painel do Desenvolvedor</h1>
              <p className="text-xs text-violet-200">{stores.length} lojas cadastradas</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadStores} className="h-9 w-9 rounded-xl bg-violet-600 flex items-center justify-center text-white hover:bg-violet-500">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={() => setUnlocked(false)} className="h-9 w-9 rounded-xl bg-violet-600 flex items-center justify-center text-white hover:bg-violet-500">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4 pb-12">
        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { key: "all",     label: "Total",     count: counts.all,     color: "bg-slate-700" },
            { key: "active",  label: "Ativos",    count: counts.active,  color: "bg-emerald-700" },
            { key: "trial",   label: "Trial",     count: counts.trial,   color: "bg-blue-700" },
            { key: "blocked", label: "Bloqueados",count: counts.blocked, color: "bg-red-700" },
          ].map(k => (
            <button
              key={k.key}
              onClick={() => setFilterStatus(k.key)}
              className={`rounded-2xl p-3 text-center transition-all ${filterStatus === k.key ? k.color : "bg-slate-800"} hover:opacity-90`}
            >
              <p className="text-2xl font-extrabold text-white">{k.count}</p>
              <p className="text-xs text-white/70 mt-0.5">{k.label}</p>
            </button>
          ))}
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            placeholder="Buscar por nome, slug ou email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-slate-800 text-white border border-slate-700 focus:outline-none focus:border-violet-500 text-sm placeholder:text-slate-500"
          />
        </div>

        {/* Lista */}
        {loading && (
          <div className="flex items-center justify-center py-12 gap-3">
            <Loader2 className="h-6 w-6 text-violet-400 animate-spin" />
            <p className="text-slate-400">Carregando lojas...</p>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-12">
            <Users className="h-12 w-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">Nenhuma loja encontrada</p>
          </div>
        )}

        <div className="space-y-3">
          {filtered.map(store => (
            <StoreCard key={store.id} store={store} onRefresh={loadStores} />
          ))}
        </div>
      </main>
    </div>
  );
}
