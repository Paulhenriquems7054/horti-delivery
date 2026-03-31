import { useRealtimeOrders, updateOrderStatus } from "@/hooks/useOrders";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import {
  Leaf,
  Package,
  Truck,
  CheckCircle,
  Clock,
  PhoneCall,
  MapPin,
  RefreshCw,
  KeyRound,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { LogOut, DollarSign } from "lucide-react";

type StatusFilter = "all" | "pending" | "preparing" | "delivered";

export default function Admin() {
  const { orders, loading } = useRealtimeOrders();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [updating, setUpdating] = useState<string | null>(null);
  const [storeSlug, setStoreSlug] = useState<string>("default");
  const [storeId, setStoreId] = useState<string>("");
  const [storeName, setStoreName] = useState<string>("");
  const [deliveryPin, setDeliveryPin] = useState<string>("1234");
  const [editingPin, setEditingPin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  // Carrega o slug e PIN da loja do usuário logado
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      (supabase as any)
        .from("stores")
        .select("id, slug, name, delivery_pin")
        .eq("user_id", data.user.id)
        .maybeSingle()
        .then(({ data: store }: any) => {
          if (store) {
            setStoreId(store.id);
            setStoreSlug(store.slug);
            setStoreName(store.name);
            setDeliveryPin(store.delivery_pin || "1234");
          }
        });
    });
  }, []);

  const handleSavePin = async () => {
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      toast.error("O PIN deve ter exatamente 4 dígitos numéricos");
      return;
    }
    setSavingPin(true);
    const { error } = await (supabase as any)
      .from("stores")
      .update({ delivery_pin: newPin })
      .eq("id", storeId);
    setSavingPin(false);
    if (error) {
      toast.error("Erro ao salvar PIN");
    } else {
      setDeliveryPin(newPin);
      setEditingPin(false);
      setNewPin("");
      toast.success("PIN atualizado com sucesso!");
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/${storeSlug}/delivery`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Link copiado!");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const handleStatus = async (id: string, status: string) => {
    setUpdating(id);
    try {
      await updateOrderStatus(id, status);
      const label = status === "preparing" ? "Preparando 🍳" : "Entregue ✅";
      toast.success(`Status atualizado: ${label}`);
    } catch {
      toast.error("Erro ao atualizar o status. Tente novamente.");
    } finally {
      setUpdating(null);
    }
  };

  const filtered = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  const counts = {
    all: orders.length,
    pending: orders.filter((o) => o.status === "pending").length,
    preparing: orders.filter((o) => o.status === "preparing").length,
    delivered: orders.filter((o) => o.status === "delivered").length,
  };

  const FILTERS: { value: StatusFilter; label: string; emoji: string }[] = [
    { value: "all", label: "Todos", emoji: "📋" },
    { value: "pending", label: "Pendentes", emoji: "⏳" },
    { value: "preparing", label: "Preparando", emoji: "🍳" },
    { value: "delivered", label: "Entregues", emoji: "✅" },
  ];

  const totalRevenue = orders
    .filter((o) => o.status === "delivered")
    .reduce((acc, current) => acc + current.total, 0);

  const pendingRevenue = orders
    .filter((o) => o.status !== "delivered")
    .reduce((acc, current) => acc + current.total, 0);

  return (
    <div className="min-h-screen bg-[hsl(120,12%,95%)]">
      {/* Header */}
      <header className="gradient-hero px-4 py-5 shadow-md sticky top-0 z-20">
        <div className="mx-auto max-w-2xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Leaf className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-white leading-tight">
                {storeName || "Painel Admin"}
              </h1>
              <p className="text-xs text-white/75">
                {storeName ? `/${storeSlug} · Tempo real` : "horti-delivery-lite · Tempo real"}
              </p>
            </div>
          </div>
          {/* Indicador live e Logout */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1">
              <span className="h-2 w-2 rounded-full bg-emerald-300 animate-pulse-dot" />
              <span className="text-xs font-bold text-white hidden sm:inline">Ao vivo</span>
            </div>
            <button
              onClick={handleLogout}
              className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5 pb-12">
        {/* Menu de Gestão */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <button
            onClick={() => navigate("/admin/basket")}
            className="bg-white border-2 border-primary/20 p-4 rounded-2xl flex items-center gap-3 shadow-sm hover:border-primary/50 hover:bg-emerald-50/30 transition-all group"
          >
            <div className="h-12 w-12 rounded-xl gradient-card shadow-card flex items-center justify-center text-2xl shrink-0">
              🛒
            </div>
            <div className="text-left flex-1 min-w-0">
              <h2 className="font-extrabold text-foreground text-base leading-tight">Produtos</h2>
              <p className="text-muted-foreground text-xs mt-0.5">Gerenciar catálogo</p>
            </div>
          </button>

          <button
            onClick={() => navigate("/admin/stores")}
            className="bg-white border-2 border-blue-200 p-4 rounded-2xl flex items-center gap-3 shadow-sm hover:border-blue-400 hover:bg-blue-50/30 transition-all group"
          >
            <div className="h-12 w-12 rounded-xl bg-blue-100 shadow-card flex items-center justify-center text-2xl shrink-0">
              🏪
            </div>
            <div className="text-left flex-1 min-w-0">
              <h2 className="font-extrabold text-foreground text-base leading-tight">Lojas</h2>
              <p className="text-muted-foreground text-xs mt-0.5">Multi-tenant</p>
            </div>
          </button>

          <button
            onClick={() => navigate("/admin/delivery-zones")}
            className="bg-white border-2 border-amber-200 p-4 rounded-2xl flex items-center gap-3 shadow-sm hover:border-amber-400 hover:bg-amber-50/30 transition-all group"
          >
            <div className="h-12 w-12 rounded-xl bg-amber-100 shadow-card flex items-center justify-center text-2xl shrink-0">
              📍
            </div>
            <div className="text-left flex-1 min-w-0">
              <h2 className="font-extrabold text-foreground text-base leading-tight">Zonas</h2>
              <p className="text-muted-foreground text-xs mt-0.5">Taxas de entrega</p>
            </div>
          </button>

          <button
            onClick={() => navigate("/admin/coupons")}
            className="bg-white border-2 border-purple-200 p-4 rounded-2xl flex items-center gap-3 shadow-sm hover:border-purple-400 hover:bg-purple-50/30 transition-all group"
          >
            <div className="h-12 w-12 rounded-xl bg-purple-100 shadow-card flex items-center justify-center text-2xl shrink-0">
              🎟️
            </div>
            <div className="text-left flex-1 min-w-0">
              <h2 className="font-extrabold text-foreground text-base leading-tight">Cupons</h2>
              <p className="text-muted-foreground text-xs mt-0.5">Descontos</p>
            </div>
          </button>

          <button
            onClick={() => navigate("/admin/analytics")}
            className="bg-white border-2 border-indigo-200 p-4 rounded-2xl flex items-center gap-3 shadow-sm hover:border-indigo-400 hover:bg-indigo-50/30 transition-all group sm:col-span-2"
          >
            <div className="h-12 w-12 rounded-xl bg-indigo-100 shadow-card flex items-center justify-center text-2xl shrink-0">
              📊
            </div>
            <div className="text-left flex-1 min-w-0">
              <h2 className="font-extrabold text-foreground text-base leading-tight">Analytics</h2>
              <p className="text-muted-foreground text-xs mt-0.5">Relatórios e métricas</p>
            </div>
          </button>

          <button
            onClick={() => navigate("/admin/direct-delivery")}
            className="bg-white border-2 border-teal-200 p-4 rounded-2xl flex items-center gap-3 shadow-sm hover:border-teal-400 hover:bg-teal-50/30 transition-all group sm:col-span-2"
          >
            <div className="h-12 w-12 rounded-xl bg-teal-100 shadow-card flex items-center justify-center text-2xl shrink-0">
              🏪
            </div>
            <div className="text-left flex-1 min-w-0">
              <h2 className="font-extrabold text-foreground text-base leading-tight">Entrega Direta</h2>
              <p className="text-muted-foreground text-xs mt-0.5">Cliente comprou na loja • solicita entrega</p>
            </div>
          </button>

          {/* Card Entregador com PIN editável */}
          <div className="bg-white border-2 border-orange-200 p-4 rounded-2xl shadow-sm sm:col-span-2">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-xl bg-orange-100 flex items-center justify-center text-2xl shrink-0">
                🛵
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-extrabold text-foreground text-base leading-tight">Tela do Entregador</h2>

                {/* Link copiável */}
                <div className="flex items-center gap-2 mt-1.5">
                  <a
                    href={`/${storeSlug}/delivery`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary font-mono hover:underline truncate"
                  >
                    {window.location.origin}/{storeSlug}/delivery
                  </a>
                  <button
                    onClick={handleCopyLink}
                    className="shrink-0 h-6 w-6 rounded-md bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
                    title="Copiar link"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-slate-500" />}
                  </button>
                </div>

                {/* PIN */}
                {!editingPin ? (
                  <div className="flex items-center gap-2 mt-2">
                    <KeyRound className="h-4 w-4 text-orange-500 shrink-0" />
                    <span className="text-sm text-muted-foreground">PIN:</span>
                    <span className="font-mono font-extrabold text-foreground tracking-widest text-base">
                      {deliveryPin}
                    </span>
                    <button
                      onClick={() => { setEditingPin(true); setNewPin(deliveryPin); }}
                      className="ml-1 text-xs text-primary font-bold hover:underline"
                    >
                      Alterar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-2">
                    <KeyRound className="h-4 w-4 text-orange-500 shrink-0" />
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="4 dígitos"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      className="w-24 h-8 px-3 border border-border rounded-lg text-sm font-mono font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/50"
                      autoFocus
                    />
                    <button
                      onClick={handleSavePin}
                      disabled={savingPin || newPin.length !== 4}
                      className="h-8 px-3 rounded-lg bg-primary text-white text-xs font-bold disabled:opacity-50 hover:bg-primary/90"
                    >
                      {savingPin ? "..." : "Salvar"}
                    </button>
                    <button
                      onClick={() => { setEditingPin(false); setNewPin(""); }}
                      className="h-8 px-3 rounded-lg border border-border text-xs font-bold text-muted-foreground hover:bg-muted"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Resumo de Vendas */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-border">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-bold uppercase tracking-wider">Receita Concluída</span>
            </div>
            <p className="text-2xl font-extrabold text-foreground">
              R$ {totalRevenue.toFixed(2).replace(".", ",")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{counts.delivered} pedidos entregues</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-border">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-bold uppercase tracking-wider">A Receber</span>
            </div>
            <p className="text-2xl font-extrabold text-foreground">
              R$ {pendingRevenue.toFixed(2).replace(".", ",")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {counts.pending + counts.preparing} pedidos em andamento
            </p>
          </div>
        </div>
        
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center gap-3 py-16">
            <RefreshCw className="h-5 w-5 text-primary animate-spin-slow" />
            <p className="text-muted-foreground font-semibold">Carregando pedidos...</p>
          </div>
        )}

        {/* Quadro Kanban (Horizontal Scroll Mobile, Grid Desktop) */}
        {!loading && (
          <div className="flex gap-4 overflow-x-auto pb-4 pt-1 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-muted-foreground/20 sm:grid sm:grid-cols-4 sm:overflow-visible sm:snap-none">
            
            {[
              { id: "pending", title: "Novos Pedidos", icon: "🔔", bg: "bg-slate-100", border: "border-slate-200" },
              { id: "preparing", title: "Separando", icon: "🍳", bg: "bg-blue-50", border: "border-blue-100" },
              { id: "delivering", title: "Na Rota", icon: "🛵", bg: "bg-amber-50", border: "border-amber-100" },
              { id: "delivered", title: "Concluído", icon: "✅", bg: "bg-emerald-50", border: "border-emerald-100" },
            ].map((col) => {
              const columnOrders = orders.filter(o => o.status === col.id);
              
              return (
                <div key={col.id} className={`flex-shrink-0 w-[85vw] sm:w-auto snap-center rounded-2xl ${col.bg} border ${col.border} flex flex-col max-h-[70vh] shadow-sm`}>
                  {/* Cabeçalho da Coluna Kanban */}
                  <div className="p-3 border-b border-black/5 bg-black/5 flex items-center justify-between sticky top-0 rounded-t-2xl">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{col.icon}</span>
                      <h3 className="font-extrabold text-slate-800 text-sm">{col.title}</h3>
                    </div>
                    <span className="bg-white/60 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">
                      {columnOrders.length}
                    </span>
                  </div>

                  {/* Lista de Cards */}
                  <div className="p-3 space-y-3 overflow-y-auto flex-1 scrollbar-hide">
                    {columnOrders.length === 0 ? (
                      <div className="py-6 text-center text-slate-400 text-xs font-semibold">
                        Vazio
                      </div>
                    ) : (
                      columnOrders.map(order => (
                        <div key={order.id} className="bg-white rounded-xl shadow-sm border border-slate-200/60 p-3 hover:shadow-md transition-shadow">
                          {/* Nome e ID */}
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="font-extrabold text-sm text-slate-800 leading-tight">{order.customer_name}</p>
                              <p className="text-[10px] text-slate-400 font-mono mt-0.5">#{order.id.split('-')[0]}</p>
                            </div>
                            <p className="font-black text-primary text-sm whitespace-nowrap">R$ {order.total?.toFixed(2)}</p>
                          </div>
                          
                          {/* Endereço Breve */}
                          <div className="flex items-start gap-1.5 text-xs text-slate-500 mb-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span className="line-clamp-2 leading-tight">{order.address}</span>
                          </div>

                          {/* Botões de Ação do Kanban */}
                          <div className="pt-2 border-t border-slate-100 flex gap-2">
                            {col.id === "pending" && (
                              <button 
                                onClick={() => handleStatus(order.id, "preparing")}
                                disabled={updating === order.id}
                                className="flex-1 h-8 rounded-lg bg-blue-100 text-blue-700 text-xs font-bold hover:bg-blue-200 active:bg-blue-300 transition-colors flex justify-center items-center gap-1"
                              >
                                {updating === order.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Preparar 🍳"}
                              </button>
                            )}
                            {col.id === "preparing" && (
                              <button 
                                onClick={() => handleStatus(order.id, "delivering")}
                                disabled={updating === order.id}
                                className="flex-1 h-8 rounded-lg bg-amber-100 text-amber-700 text-xs font-bold hover:bg-amber-200 active:bg-amber-300 transition-colors flex justify-center items-center gap-1"
                              >
                                {updating === order.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Enviar Moto 🛵"}
                              </button>
                            )}
                            {col.id === "delivering" && (
                              <button 
                                onClick={() => handleStatus(order.id, "delivered")}
                                disabled={updating === order.id}
                                className="flex-1 h-8 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold hover:bg-emerald-200 active:bg-emerald-300 transition-colors flex justify-center items-center gap-1"
                              >
                                {updating === order.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Entregue ✅"}
                              </button>
                            )}
                            {(col.id === "pending" || col.id === "preparing") && (
                              <a 
                                href={`https://wa.me/55${order.phone.replace(/\D/g, '')}`} 
                                target="_blank" 
                                rel="noreferrer"
                                className="h-8 w-8 rounded-lg bg-green-50 text-green-600 border border-green-200 flex items-center justify-center hover:bg-green-100 transition-colors"
                                title="Chamar no WhatsApp"
                              >
                                <PhoneCall className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
