import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, Package, MapPin, Clock, CheckCircle2, ChefHat, Bike, Loader2, Leaf, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useParams, useNavigate } from "react-router-dom";
import { useStoreInfo } from "@/hooks/useStoreInfo";
import { paymentLabel } from "@/lib/paymentMethods";

type Order = {
  id: string;
  customer_name: string;
  phone: string;
  address: string;
  status: string;
  total: number;
  created_at: string;
  notes?: string;
  payment_method?: string;
};

const ACTIVE_STATUSES = ["pending", "preparing", "ready_for_delivery", "delivering"];

const STATUS_STEPS = [
  { key: "pending",    label: "Recebido",   icon: Package,       color: "text-muted-foreground dark:text-muted-foreground",  bg: "bg-muted dark:bg-muted"  },
  { key: "preparing",  label: "Separando",  icon: ChefHat,       color: "text-blue-600 dark:text-blue-400",   bg: "bg-blue-100 dark:bg-blue-950/30"   },
  { key: "delivering", label: "Na Rota",    icon: Bike,          color: "text-amber-600 dark:text-amber-400",  bg: "bg-amber-100 dark:bg-amber-950/30"  },
  { key: "delivered",  label: "Entregue",   icon: CheckCircle2,  color: "text-emerald-600 dark:text-emerald-400",bg: "bg-emerald-100 dark:bg-emerald-950/30"},
];

function getStepIndex(status: string) {
  return STATUS_STEPS.findIndex(s => s.key === status);
}

function StatusTimeline({ status }: { status: string }) {
  const currentIdx = getStepIndex(status);

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="flex items-center justify-between relative">
        {/* linha de progresso */}
        <div className="absolute left-0 right-0 top-5 h-1 bg-muted mx-6 z-0" />
        <div
          className="absolute left-0 top-5 h-1 bg-emerald-400 dark:bg-emerald-500 z-0 transition-all duration-700"
          style={{ width: `${currentIdx === 0 ? 0 : (currentIdx / (STATUS_STEPS.length - 1)) * 100}%`, marginLeft: "1.5rem", marginRight: "1.5rem", maxWidth: "calc(100% - 3rem)" }}
        />

        {STATUS_STEPS.map((step, idx) => {
          const Icon = step.icon;
          const done = idx <= currentIdx;
          const active = idx === currentIdx;

          return (
            <div key={step.key} className="flex flex-col items-center gap-1.5 z-10 flex-1">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                done ? step.bg : "bg-muted"
              } ${active ? "ring-2 ring-offset-2 ring-emerald-400 dark:ring-emerald-500 scale-110" : ""}`}>
                <Icon className={`h-5 w-5 ${done ? step.color : "text-muted-foreground/40"}`} />
              </div>
              <span className={`text-[10px] font-bold text-center leading-tight ${done ? "text-foreground" : "text-muted-foreground/40"}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Mensagem de status */}
      <div className="mt-4 text-center">
        {status === "pending" && <p className="text-sm text-muted-foreground">⏳ Aguardando confirmação da loja</p>}
        {status === "preparing" && <p className="text-sm text-blue-600 dark:text-blue-400 font-semibold">🧑‍🍳 Sua cesta está sendo separada!</p>}
        {status === "delivering" && <p className="text-sm text-amber-600 dark:text-amber-400 font-semibold">🛵 Entregador a caminho!</p>}
        {status === "delivered" && <p className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold">✅ Pedido entregue! Bom apetite 🥬</p>}
      </div>
    </div>
  );
}

function useRealtimeCustomerOrders(phone: string, storeSlug?: string) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!phone) { setOrders([]); return; }

    setLoading(true);

    // Busca inicial — filtra por loja se disponível
    (async () => {
      const { data, error } = await supabase.rpc("get_orders_by_phone", {
        p_phone: phone,
        p_store_slug: storeSlug ?? null,
      });
      if (!error && data) setOrders(data as Order[]);
      else if (error) console.error("Erro ao buscar pedidos:", error);
      setLoading(false);
    })();

    const interval = setInterval(async () => {
      const { data } = await supabase.rpc("get_orders_by_phone", {
        p_phone: phone,
        p_store_slug: storeSlug ?? null,
      });
      if (data) setOrders(data as Order[]);
    }, 10000);

    return () => clearInterval(interval);
  }, [phone, storeSlug]);

  return { orders, loading };
}

export default function OrderTracking() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { data: store } = useStoreInfo(slug);
  
  const [phone, setPhone] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const { orders, loading } = useRealtimeCustomerOrders(searchPhone, slug);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("horti_last_order_phone");
      if (saved && saved.replace(/\D/g, "").length >= 10) {
        setPhone(saved);
        setSearchPhone(saved.replace(/\D/g, ""));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const handleSearch = () => {
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 10) { 
      toast.error("Digite um telefone válido"); 
      return; 
    }
    setSearchPhone(clean);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="gradient-hero px-4 py-5 shadow-md sticky top-0 z-20">
        <div className="mx-auto max-w-2xl flex items-center gap-3">
          <button 
            onClick={() => slug ? navigate(`/${slug}`) : navigate(-1)} 
            className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center text-white hover:bg-white/30 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          {store && (
            <>
              <div className="h-10 w-10 rounded-xl bg-card/20 flex items-center justify-center overflow-hidden p-1.5">
                <img 
                  src="/play_store_512.png" 
                  alt="Logo" 
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex-1">
                <h1 className="text-base font-extrabold text-white leading-tight">
                  {store.name}
                </h1>
                <p className="text-xs text-white/75">Rastreamento de Pedidos</p>
              </div>
            </>
          )}
          {!store && (
            <div>
              <h1 className="text-xl font-extrabold text-white">Rastrear Pedido</h1>
              <p className="text-xs text-white/75">Acompanhe sua entrega em tempo real 📦</p>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 pb-20">
        {/* Busca */}
        <div className="bg-card rounded-2xl p-5 shadow-sm border border-border mb-6">
          <p className="text-sm font-bold text-foreground mb-3">Digite o telefone usado no pedido</p>
          <div className="flex gap-2">
            <Input
              placeholder="(11) 99999-9999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              autoComplete="tel"
            />
            <Button onClick={handleSearch} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto mb-3" />
            <p className="text-muted-foreground">Buscando pedidos...</p>
          </div>
        )}

        {/* Sem resultados */}
        {!loading && searchPhone && orders.length === 0 && (
          <div className="text-center py-12">
            <Package className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-2">Nenhum pedido encontrado</h2>
            <p className="text-muted-foreground text-sm">Verifique se o telefone está correto</p>
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
          <p className="text-xs font-extrabold uppercase tracking-wide text-amber-800 mb-1">Importante</p>
          <p className="text-sm text-amber-900 leading-relaxed">
            Após confirmar um pedido, comprometa-se a aguardar a entrega no endereço informado. Pedimos respeito e consideração com o entregador, evitando pedidos sem intenção de recebimento.
          </p>
        </div>

        {/* Lista de pedidos */}
        {orders.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground font-semibold">
                {orders.length} pedido(s) encontrado(s)
              </p>
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Atualização automática
              </div>
            </div>

            {orders.map((order) => (
              <div
                key={order.id}
                className={`bg-card rounded-2xl p-5 shadow-sm border animate-slide-up ${
                  ACTIVE_STATUSES.includes(order.status) ? "border-emerald-400 ring-1 ring-emerald-200" : "border-border"
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs text-muted-foreground font-mono">#{order.id.split("-")[0]}</p>
                    <p className="font-bold text-lg text-foreground mt-0.5">{order.customer_name}</p>
                  </div>
                  <div className="text-right">
                    {ACTIVE_STATUSES.includes(order.status) && (
                      <p className="text-[10px] font-extrabold text-emerald-700 uppercase">Pedido atual</p>
                    )}
                    <span className="text-2xl font-extrabold text-primary">
                      R$ {Number(order.total).toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                </div>

                {/* Endereço e data */}
                <div className="space-y-1.5 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{order.address}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span>{new Date(order.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                  {order.payment_method && (
                    <p className="text-sm">Pagamento: {paymentLabel(order.payment_method)} (somente na entrega)</p>
                  )}
                </div>

                {/* Timeline de status */}
                <StatusTimeline status={order.status} />

                {/* Observações */}
                {order.notes && (
                  <div className="mt-3 p-3 bg-muted rounded-lg">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Observações:</p>
                    <p className="text-sm">{order.notes}</p>
                  </div>
                )}
              </div>
            ))}
            
            {/* Botão voltar à loja */}
            {slug && (
              <button
                onClick={() => navigate(`/${slug}`)}
                className="w-full h-12 rounded-2xl border-2 border-primary text-primary font-bold hover:bg-accent transition-colors"
              >
                ← Voltar à Loja
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
