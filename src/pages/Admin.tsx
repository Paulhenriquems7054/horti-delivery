import { useRealtimeOrders, updateOrderStatus, deleteOrder } from "@/hooks/useOrders";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { ReceiptCameraModal } from "@/components/ReceiptCameraModal";
import { ReceiptValueModal } from "@/components/ReceiptValueModal";
import { OrderDetailsModal } from "@/components/OrderDetailsModal";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Leaf,
  Package,
  Truck,
  CheckCircle,
  Clock,
  MapPin,
  RefreshCw,
  KeyRound,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
  Camera,
  Eye,
  MessageCircle,
  Send,
  X,
  PencilLine,
} from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { LogOut, DollarSign } from "lucide-react";
import { logAuditEvent } from "@/hooks/useAuditLog";
import { useTenant } from "@/contexts/TenantContext";

type StatusFilter = "all" | "pending" | "preparing" | "ready_for_delivery" | "delivering" | "delivered";

type QuickChatMessage = {
  author: "admin" | "client" | "delivery";
  message: string;
  created_at: string;
};

export default function Admin() {
  const { store: tenantStore } = useTenant();
  const { orders, loading, removeOrder } = useRealtimeOrders(tenantStore?.id);
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
  const [allowDeleteDelivered, setAllowDeleteDelivered] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<any | null>(null);
  const [receiptValueOrder, setReceiptValueOrder] = useState<any | null>(null);
  const [detailsOrder, setDetailsOrder] = useState<any | null>(null);
  const [chatOrder, setChatOrder] = useState<any | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<QuickChatMessage[]>([]);
  const navigate = useNavigate();

  // Use TenantContext — no more manual store resolution
  useEffect(() => {
    if (tenantStore) {
      setStoreId(tenantStore.id);
      setStoreSlug(tenantStore.slug);
      setStoreName(tenantStore.name);
      setDeliveryPin(tenantStore.delivery_pin || "1234");
    }
  }, [tenantStore]);

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
    await logAuditEvent("logout", storeId || undefined);
    await supabase.auth.signOut();
    navigate("/login");
  };

  const handleStatus = async (id: string, status: string) => {
    setUpdating(id);
    try {
      await updateOrderStatus(id, status);
      const label =
        status === "preparing"
          ? "Preparando 🍳"
          : status === "ready_for_delivery"
            ? "Pronto para entrega 📦"
            : status === "delivering"
              ? "Na Rota 🛵"
              : "Entregue ✅";
      toast.success(`Status atualizado: ${label}`);
    } catch {
      toast.error("Erro ao atualizar o status. Tente novamente.");
    } finally {
      setUpdating(null);
    }
  };

  const handleDeleteOrder = async (orderId: string, orderStatus: string) => {
    // Verifica se pode deletar pedidos concluídos
    if (orderStatus === "delivered" && !allowDeleteDelivered) {
      toast.error("Exclusão de pedidos concluídos está desabilitada. Ative nas configurações.");
      return;
    }

    // Pede confirmação
    if (confirmDelete !== orderId) {
      setConfirmDelete(orderId);
      toast.warning("Clique novamente para confirmar a exclusão");
      setTimeout(() => setConfirmDelete(null), 3000);
      return;
    }

    setDeletingOrder(orderId);
    try {
      await deleteOrder(orderId);
      // Remove o pedido imediatamente da interface (fallback se realtime falhar)
      removeOrder(orderId);
      toast.success("Pedido excluído com sucesso");
      setConfirmDelete(null);
    } catch (error) {
      console.error(error);
      toast.error("Erro ao excluir pedido");
    } finally {
      setDeletingOrder(null);
    }
  };

  const quickChatTemplates = [
    "Pedido recebido e em preparação.",
    "Pedido saiu para entrega.",
    "Entregador está chegando ao endereço.",
    "Poderia confirmar ponto de referência?",
  ];

  useEffect(() => {
    if (!chatOrder?.id) {
      setChatMessages([]);
      return;
    }

    const loadChatMessages = async () => {
      const { data } = await (supabase as any)
        .from("order_tracking")
        .select("notes, created_at")
        .eq("order_id", chatOrder.id)
        .order("created_at", { ascending: true });

      const parsedMessages = ((data as Array<{ notes: string | null; created_at: string }> | null) ?? [])
        .filter((row) => {
          const notes = row.notes ?? "";
          return (
            notes.startsWith("[CHAT-ADMIN]") ||
            notes.startsWith("[CHAT-CLIENTE]") ||
            notes.startsWith("[CHAT-ENTREGADOR-ADMIN]")
          );
        })
        .map((row) => {
          const notes = row.notes ?? "";
          if (notes.startsWith("[CHAT-ADMIN]")) {
            return {
              author: "admin" as const,
              message: notes.replace("[CHAT-ADMIN]", "").trim(),
              created_at: row.created_at,
            };
          }

          if (notes.startsWith("[CHAT-ENTREGADOR-ADMIN]")) {
            return {
              author: "delivery" as const,
              message: notes.replace("[CHAT-ENTREGADOR-ADMIN]", "").trim(),
              created_at: row.created_at,
            };
          }

          return {
            author: "client" as const,
            message: notes.replace("[CHAT-CLIENTE]", "").trim(),
            created_at: row.created_at,
          };
        })
        .filter((row) => row.message.length > 0);

      setChatMessages(parsedMessages.slice(-30));
    };

    loadChatMessages();

    const channel = supabase
      .channel(`admin-chat-${chatOrder.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "order_tracking",
          filter: `order_id=eq.${chatOrder.id}`,
        },
        () => {
          loadChatMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatOrder?.id]);

  const handleSendChat = async (message: string) => {
    if (!chatOrder || !message.trim()) return;
    setSendingChat(true);
    try {
      const { error } = await (supabase as any).from("order_tracking").insert({
        order_id: chatOrder.id,
        status: chatOrder.status,
        notes: `[CHAT-ADMIN] ${message.trim()}`,
      });

      if (error) throw error;
      toast.success("Mensagem interna registrada no pedido");
      setChatMessage("");
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível registrar a mensagem");
    } finally {
      setSendingChat(false);
    }
  };

  const filtered = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  const counts = {
    all: orders.length,
    pending: orders.filter((o) => o.status === "pending").length,
    preparing: orders.filter((o) => o.status === "preparing").length,
    ready_for_delivery: orders.filter((o) => o.status === "ready_for_delivery").length,
    delivering: orders.filter((o) => o.status === "delivering").length,
    delivered: orders.filter((o) => o.status === "delivered").length,
  };

  const FILTERS: { value: StatusFilter; label: string; emoji: string }[] = [
    { value: "all", label: "Todos", emoji: "📋" },
    { value: "pending", label: "Pendentes", emoji: "⏳" },
    { value: "preparing", label: "Preparando", emoji: "🍳" },
    { value: "ready_for_delivery", label: "Pronto", emoji: "📦" },
    { value: "delivering", label: "Na Rota", emoji: "🛵" },
    { value: "delivered", label: "Entregues", emoji: "✅" },
  ];

  const totalRevenue = orders
    .filter((o) => o.status === "delivered")
    .reduce((acc, current) => acc + current.total, 0);

  const pendingRevenue = orders
    .filter((o) => o.status !== "delivered")
    .reduce((acc, current) => acc + current.total, 0);

  return (
    <div className="min-h-screen bg-[hsl(120,12%,95%)] dark:bg-slate-900">
      {/* Header */}
      <header className="gradient-hero px-4 py-5 shadow-md sticky top-0 z-20">
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center overflow-hidden p-1.5">
              <img 
                src="/play_store_512.png" 
                alt="Logo" 
                className="w-full h-full object-contain"
              />
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
            <div className="flex items-center gap-1.5 bg-white/20 dark:bg-slate-800/50 rounded-full px-3 py-1">
              <span className="h-2 w-2 rounded-full bg-emerald-300 animate-pulse-dot" />
              <span className="text-xs font-bold text-white hidden sm:inline">Ao vivo</span>
            </div>
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="h-8 w-8 rounded-full bg-white/10 dark:bg-slate-800/50 flex items-center justify-center text-white hover:bg-white/20 dark:hover:bg-slate-700/50 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 pb-12">
        {/* Menu de Gestão */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <button
            onClick={() => navigate("/track")}
            className="bg-card dark:bg-card border-2 border-emerald-200 dark:border-emerald-800 p-4 rounded-2xl flex items-center gap-3 shadow-sm hover:border-emerald-400 dark:hover:border-emerald-600 hover:bg-emerald-50/30 dark:hover:bg-emerald-900/20 transition-all group"
          >
            <div className="h-12 w-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 shadow-card flex items-center justify-center text-2xl shrink-0">
              📦
            </div>
            <div className="text-left flex-1 min-w-0">
              <h2 className="font-extrabold text-foreground text-base leading-tight">Rastrear Pedido</h2>
              <p className="text-muted-foreground text-xs mt-0.5">Buscar por código</p>
            </div>
          </button>

          <button
            onClick={() => navigate("/admin/basket")}
            className="bg-card dark:bg-card border-2 border-primary/20 dark:border-primary/40 p-4 rounded-2xl flex items-center gap-3 shadow-sm hover:border-primary/50 dark:hover:border-primary/60 hover:bg-emerald-50/30 dark:hover:bg-emerald-900/20 transition-all group"
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
            className="bg-card dark:bg-card border-2 border-blue-200 dark:border-blue-800 p-4 rounded-2xl flex items-center gap-3 shadow-sm hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50/30 dark:hover:bg-blue-900/20 transition-all group"
          >
            <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-900/50 shadow-card flex items-center justify-center text-2xl shrink-0">
              🏪
            </div>
            <div className="text-left flex-1 min-w-0">
              <h2 className="font-extrabold text-foreground text-base leading-tight">Lojas</h2>
              <p className="text-muted-foreground text-xs mt-0.5">Multi-tenant</p>
            </div>
          </button>

          <button
            onClick={() => navigate("/admin/delivery-zones")}
            className="bg-card dark:bg-card border-2 border-amber-200 dark:border-amber-800 p-4 rounded-2xl flex items-center gap-3 shadow-sm hover:border-amber-400 dark:hover:border-amber-600 hover:bg-amber-50/30 dark:hover:bg-amber-900/20 transition-all group"
          >
            <div className="h-12 w-12 rounded-xl bg-amber-100 dark:bg-amber-900/50 shadow-card flex items-center justify-center text-2xl shrink-0">
              📍
            </div>
            <div className="text-left flex-1 min-w-0">
              <h2 className="font-extrabold text-foreground text-base leading-tight">Zonas</h2>
              <p className="text-muted-foreground text-xs mt-0.5">Taxas de entrega</p>
            </div>
          </button>

          <button
            onClick={() => navigate("/admin/coupons")}
            className="bg-card dark:bg-card border-2 border-purple-200 dark:border-purple-800 p-4 rounded-2xl flex items-center gap-3 shadow-sm hover:border-purple-400 dark:hover:border-purple-600 hover:bg-purple-50/30 dark:hover:bg-purple-900/20 transition-all group"
          >
            <div className="h-12 w-12 rounded-xl bg-purple-100 dark:bg-purple-900/50 shadow-card flex items-center justify-center text-2xl shrink-0">
              🎟️
            </div>
            <div className="text-left flex-1 min-w-0">
              <h2 className="font-extrabold text-foreground text-base leading-tight">Cupons</h2>
              <p className="text-muted-foreground text-xs mt-0.5">Descontos</p>
            </div>
          </button>

          <button
            onClick={() => navigate("/admin/preparation")}
            className="bg-card dark:bg-card border-2 border-cyan-200 dark:border-cyan-800 p-4 rounded-2xl flex items-center gap-3 shadow-sm hover:border-cyan-400 dark:hover:border-cyan-600 hover:bg-cyan-50/30 dark:hover:bg-cyan-900/20 transition-all group"
          >
            <div className="h-12 w-12 rounded-xl bg-cyan-100 dark:bg-cyan-900/50 shadow-card flex items-center justify-center text-2xl shrink-0">
              ⚖️
            </div>
            <div className="text-left flex-1 min-w-0">
              <h2 className="font-extrabold text-foreground text-base leading-tight">Separação</h2>
              <p className="text-muted-foreground text-xs mt-0.5">Balança e conferência</p>
            </div>
          </button>

          <button
            onClick={() => navigate("/admin/analytics")}
            className="bg-card dark:bg-card border-2 border-indigo-200 dark:border-indigo-800 p-4 rounded-2xl flex items-center gap-3 shadow-sm hover:border-indigo-400 dark:hover:border-indigo-600 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/20 transition-all group sm:col-span-2"
          >
            <div className="h-12 w-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 shadow-card flex items-center justify-center text-2xl shrink-0">
              📊
            </div>
            <div className="text-left flex-1 min-w-0">
              <h2 className="font-extrabold text-foreground text-base leading-tight">Analytics</h2>
              <p className="text-muted-foreground text-xs mt-0.5">Relatórios e métricas</p>
            </div>
          </button>

          {/* Card Entregador com PIN editável */}
          <div className="bg-card dark:bg-card border-2 border-orange-200 dark:border-orange-800 p-4 rounded-2xl shadow-sm sm:col-span-2">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-xl bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center text-2xl shrink-0">
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
          <div className="bg-card dark:bg-card rounded-2xl p-4 shadow-sm border border-border">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-bold uppercase tracking-wider">Receita Concluída</span>
            </div>
            <p className="text-2xl font-extrabold text-foreground">
              R$ {totalRevenue.toFixed(2).replace(".", ",")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{counts.delivered} pedidos entregues</p>
          </div>
          <div className="bg-card dark:bg-card rounded-2xl p-4 shadow-sm border border-border">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-bold uppercase tracking-wider">A Receber</span>
            </div>
            <p className="text-2xl font-extrabold text-foreground">
              R$ {pendingRevenue.toFixed(2).replace(".", ",")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {counts.pending + counts.preparing + counts.ready_for_delivery + counts.delivering} pedidos em andamento
            </p>
          </div>
        </div>

        {/* Configurações de Exclusão */}
        <div className="mb-6 bg-card dark:bg-card rounded-2xl p-4 shadow-sm border border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-500" />
              <div>
                <p className="text-sm font-bold text-foreground">Permitir excluir pedidos concluídos</p>
                <p className="text-xs text-muted-foreground">Ative para poder deletar pedidos já entregues</p>
              </div>
            </div>
            <button
              onClick={() => setAllowDeleteDelivered(!allowDeleteDelivered)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                allowDeleteDelivered ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  allowDeleteDelivered ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
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
          <div className="flex gap-4 overflow-x-auto pb-4 pt-1 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-muted-foreground/20 xl:grid xl:grid-cols-5 xl:overflow-visible xl:snap-none">
            
            {[
              { id: "pending", title: "Novos Pedidos", icon: "🔔", bg: "bg-slate-100 dark:bg-slate-800", border: "border-slate-200 dark:border-slate-700" },
              { id: "preparing", title: "Separando", icon: "🍳", bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-100 dark:border-blue-900" },
              { id: "ready_for_delivery", title: "Pronto p/ Entrega", icon: "📦", bg: "bg-cyan-50 dark:bg-cyan-950/30", border: "border-cyan-100 dark:border-cyan-900" },
              { id: "delivering", title: "Na Rota", icon: "🛵", bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-100 dark:border-amber-900" },
              { id: "delivered", title: "Concluído", icon: "✅", bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-100 dark:border-emerald-900" },
            ].map((col) => {
              const columnOrders = orders.filter(o => o.status === col.id);
              
              return (
                <div key={col.id} className={`flex-shrink-0 w-[88vw] sm:w-[420px] lg:w-[460px] xl:w-auto snap-center rounded-2xl ${col.bg} border ${col.border} flex flex-col max-h-[70vh] shadow-sm`}>
                  {/* Cabeçalho da Coluna Kanban */}
                  <div className="p-3 border-b border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 flex items-center justify-between sticky top-0 rounded-t-2xl">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{col.icon}</span>
                      <h3 className="font-extrabold text-foreground text-sm">{col.title}</h3>
                    </div>
                    <span className="bg-white/60 dark:bg-black/40 text-slate-600 dark:text-slate-300 text-xs font-bold px-2 py-0.5 rounded-full">
                      {columnOrders.length}
                    </span>
                  </div>

                  {/* Lista de Cards */}
                  <div className="p-3 space-y-3 overflow-y-auto flex-1 scrollbar-hide">
                    {columnOrders.length === 0 ? (
                      <div className="py-6 text-center text-muted-foreground text-xs font-semibold">
                        Vazio
                      </div>
                    ) : (
                      columnOrders.map(order => (
                        <div key={order.id} className="bg-card dark:bg-card rounded-xl shadow-sm border border-border p-3 hover:shadow-md transition-shadow">
                          {/* Nome e ID */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-extrabold text-sm text-foreground leading-tight break-words line-clamp-2">{order.customer_name}</p>
                              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">#{order.id.split('-')[0]}</p>
                            </div>
                            <p className="font-black text-primary text-sm whitespace-nowrap shrink-0">R$ {order.total?.toFixed(2).replace(".", ",")}</p>
                          </div>
                          
                          {/* Endereço Breve */}
                          <div className="flex items-start gap-1.5 text-xs text-muted-foreground mb-3 bg-muted/50 dark:bg-muted/30 p-2 rounded-lg border border-border">
                            <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span className="line-clamp-3 leading-tight break-words">{order.address}</span>
                          </div>

                          {/* Botões de Ação do Kanban */}
                          <div className="pt-2 border-t border-slate-100 space-y-2">
                            <button
                              onClick={() => setDetailsOrder(order)}
                              className="w-full h-8 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors flex items-center justify-center gap-1"
                              title="Ver detalhes do pedido"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span className="truncate">Ver pedido</span>
                            </button>
                            {col.id === "pending" && (
                              <>
                                {/* Linha 1: Botão principal */}
                                <button 
                                  onClick={() => handleStatus(order.id, "preparing")}
                                  disabled={updating === order.id}
                                  className="w-full h-8 rounded-lg bg-blue-100 text-blue-700 text-xs font-bold hover:bg-blue-200 active:bg-blue-300 transition-colors flex justify-center items-center gap-1"
                                >
                                  {updating === order.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <span className="truncate">Preparar 🍳</span>}
                                </button>
                                
                                {/* Linha 2: Ações secundárias */}
                                <div className="grid grid-cols-4 gap-2">
                                  <button
                                    onClick={() => setReceiptValueOrder(order)}
                                    className="h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center justify-center"
                                    title="Registrar apenas valor (sem foto)"
                                  >
                                    <DollarSign className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setReceiptOrder(order)}
                                    className="h-8 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors flex items-center justify-center"
                                    title="Registrar cupom fiscal"
                                  >
                                    <Camera className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setChatOrder(order)}
                                    className="h-8 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors flex items-center justify-center"
                                    title="Chat rápido interno"
                                  >
                                    <MessageCircle className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteOrder(order.id, order.status)}
                                    disabled={deletingOrder === order.id}
                                    className={`h-8 rounded-lg flex items-center justify-center transition-colors ${
                                      confirmDelete === order.id
                                        ? "bg-red-500 text-white"
                                        : "bg-red-50 text-red-600 hover:bg-red-100"
                                    }`}
                                    title="Excluir pedido"
                                  >
                                    {deletingOrder === order.id ? (
                                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                    ) : confirmDelete === order.id ? (
                                      <AlertTriangle className="h-3.5 w-3.5" />
                                    ) : (
                                      <Trash2 className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </div>
                              </>
                            )}
                            {col.id === "preparing" && (
                              <>
                                {/* Linha 1: Botão principal */}
                                <button 
                                  onClick={() => handleStatus(order.id, "ready_for_delivery")}
                                  disabled={updating === order.id}
                                  className="w-full h-8 rounded-lg bg-cyan-100 text-cyan-700 text-xs font-bold hover:bg-cyan-200 active:bg-cyan-300 transition-colors flex justify-center items-center gap-1"
                                >
                                  {updating === order.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <span className="truncate">Pronto 📦</span>}
                                </button>
                                
                                {/* Linha 2: Ações secundárias */}
                                <div className="grid grid-cols-4 gap-2">
                                  <button
                                    onClick={() => setReceiptValueOrder(order)}
                                    className="h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center justify-center"
                                    title="Registrar apenas valor (sem foto)"
                                  >
                                    <DollarSign className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setReceiptOrder(order)}
                                    className="h-8 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors flex items-center justify-center"
                                    title="Registrar cupom fiscal"
                                  >
                                    <Camera className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setChatOrder(order)}
                                    className="h-8 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors flex items-center justify-center"
                                    title="Chat rápido interno"
                                  >
                                    <MessageCircle className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteOrder(order.id, order.status)}
                                    disabled={deletingOrder === order.id}
                                    className={`h-8 rounded-lg flex items-center justify-center transition-colors ${
                                      confirmDelete === order.id
                                        ? "bg-red-500 text-white"
                                        : "bg-red-50 text-red-600 hover:bg-red-100"
                                    }`}
                                    title="Excluir pedido"
                                  >
                                    {deletingOrder === order.id ? (
                                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                    ) : confirmDelete === order.id ? (
                                      <AlertTriangle className="h-3.5 w-3.5" />
                                    ) : (
                                      <Trash2 className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </div>
                              </>
                            )}
                            {col.id === "ready_for_delivery" && (
                              <>
                                <button
                                  onClick={() => handleStatus(order.id, "delivering")}
                                  disabled={updating === order.id}
                                  className="w-full h-8 rounded-lg bg-amber-100 text-amber-700 text-xs font-bold hover:bg-amber-200 active:bg-amber-300 transition-colors flex justify-center items-center gap-1"
                                >
                                  {updating === order.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <span className="truncate">Enviar 🛵</span>}
                                </button>
                                <div className="grid grid-cols-2 gap-2">
                                  <button
                                    onClick={() => setChatOrder(order)}
                                    className="h-8 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors flex items-center justify-center"
                                    title="Chat rápido interno"
                                  >
                                    <MessageCircle className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteOrder(order.id, order.status)}
                                    disabled={deletingOrder === order.id}
                                    className={`h-8 rounded-lg flex items-center justify-center gap-1 text-xs font-bold transition-colors ${
                                      confirmDelete === order.id
                                        ? "bg-red-500 text-white"
                                        : "bg-red-50 text-red-600 hover:bg-red-100"
                                    }`}
                                    title="Excluir pedido"
                                  >
                                    {deletingOrder === order.id ? (
                                      <RefreshCw className="h-3 w-3 animate-spin" />
                                    ) : confirmDelete === order.id ? (
                                      <>
                                        <AlertTriangle className="h-3 w-3" />
                                        <span className="truncate">Confirmar</span>
                                      </>
                                    ) : (
                                      <>
                                        <Trash2 className="h-3 w-3" />
                                        <span className="truncate">Excluir</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </>
                            )}
                            {col.id === "delivering" && (
                              <>
                                {/* Linha 1: Botão principal */}
                                <button 
                                  onClick={() => handleStatus(order.id, "delivered")}
                                  disabled={updating === order.id}
                                  className="w-full h-8 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold hover:bg-emerald-200 active:bg-emerald-300 transition-colors flex justify-center items-center gap-1"
                                >
                                  {updating === order.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <span className="truncate">Entregue ✅</span>}
                                </button>
                                
                                {/* Linha 2: Ação de exclusão */}
                                <button
                                  onClick={() => handleDeleteOrder(order.id, order.status)}
                                  disabled={deletingOrder === order.id}
                                  className={`w-full h-8 rounded-lg flex items-center justify-center gap-1 text-xs font-bold transition-colors ${
                                    confirmDelete === order.id
                                      ? "bg-red-500 text-white"
                                      : "bg-red-50 text-red-600 hover:bg-red-100"
                                  }`}
                                  title="Excluir pedido"
                                >
                                  {deletingOrder === order.id ? (
                                    <RefreshCw className="h-3 w-3 animate-spin" />
                                  ) : confirmDelete === order.id ? (
                                    <>
                                      <AlertTriangle className="h-3 w-3" />
                                      <span className="truncate">Confirmar</span>
                                    </>
                                  ) : (
                                    <>
                                      <Trash2 className="h-3 w-3" />
                                      <span className="truncate">Excluir</span>
                                    </>
                                  )}
                                </button>
                              </>
                            )}
                            {col.id === "delivered" && allowDeleteDelivered && (
                              <button
                                onClick={() => handleDeleteOrder(order.id, order.status)}
                                disabled={deletingOrder === order.id}
                                className={`w-full h-8 rounded-lg flex items-center justify-center gap-1 text-xs font-bold transition-colors ${
                                  confirmDelete === order.id
                                    ? "bg-red-500 text-white"
                                    : "bg-red-50 text-red-600 hover:bg-red-100"
                                }`}
                                title="Excluir pedido concluído"
                              >
                                {deletingOrder === order.id ? (
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                ) : confirmDelete === order.id ? (
                                  <>
                                    <AlertTriangle className="h-3 w-3" />
                                    <span className="truncate">Confirmar</span>
                                  </>
                                ) : (
                                  <>
                                    <Trash2 className="h-3 w-3" />
                                    <span className="truncate">Excluir</span>
                                  </>
                                )}
                              </button>
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

      {/* Modal de Captura de Cupom */}
      {receiptOrder && (
        <ReceiptCameraModal
          orderId={receiptOrder.id}
          customerName={receiptOrder.customer_name}
          orderTotal={receiptOrder.total}
          onClose={() => setReceiptOrder(null)}
          onSuccess={() => {
            setReceiptOrder(null);
            window.location.reload();
          }}
        />
      )}

      {/* Modal de valor manual sem foto */}
      {receiptValueOrder && (
        <ReceiptValueModal
          orderId={receiptValueOrder.id}
          customerName={receiptValueOrder.customer_name}
          orderTotal={receiptValueOrder.total}
          onClose={() => setReceiptValueOrder(null)}
          onSuccess={() => {
            setReceiptValueOrder(null);
            window.location.reload();
          }}
        />
      )}

      {/* Modal de detalhes do pedido */}
      <OrderDetailsModal
        order={detailsOrder}
        onClose={() => setDetailsOrder(null)}
      />

      {/* Modal de chat rápido interno */}
      {chatOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-md rounded-2xl border border-border shadow-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-foreground">Chat rápido interno</h3>
                <p className="text-xs text-muted-foreground">
                  Pedido #{chatOrder.id.split("-")[0]} · {chatOrder.customer_name}
                </p>
              </div>
              <button
                onClick={() => setChatOrder(null)}
                className="h-8 w-8 rounded-lg bg-muted hover:bg-accent flex items-center justify-center"
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <div className="max-h-44 overflow-y-auto space-y-2 border border-border rounded-lg p-2 bg-muted/30">
                {chatMessages.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem mensagens ainda.</p>
                ) : (
                  chatMessages.map((msg, idx) => (
                    <div
                      key={`${msg.created_at}-${idx}`}
                      className={`rounded-lg px-3 py-2 text-xs ${
                        msg.author === "admin"
                          ? "bg-blue-50 text-blue-800 border border-blue-200 ml-6"
                          : msg.author === "delivery"
                            ? "bg-emerald-50 text-emerald-900 border border-emerald-200 mr-6"
                            : "bg-amber-50 text-amber-900 border border-amber-200 mr-6"
                      }`}
                    >
                      <p className="font-bold mb-0.5">
                        {msg.author === "admin" ? "Loja" : msg.author === "delivery" ? "Entregador" : "Cliente"}
                      </p>
                      <p>{msg.message}</p>
                    </div>
                  ))
                )}
              </div>

              {quickChatTemplates.map((template) => (
                <button
                  key={template}
                  onClick={() => handleSendChat(template)}
                  disabled={sendingChat}
                  className="h-9 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition-colors px-3 text-left"
                >
                  {template}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <textarea
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Mensagem livre (opcional)"
                className="w-full min-h-20 rounded-lg border border-border px-3 py-2 text-sm bg-card"
              />
              <button
                onClick={() => handleSendChat(chatMessage)}
                disabled={sendingChat || !chatMessage.trim()}
                className="w-full h-9 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1"
              >
                <Send className="h-3.5 w-3.5" />
                Enviar mensagem
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
