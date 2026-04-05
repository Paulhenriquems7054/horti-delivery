import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, Package, MapPin, Clock, CheckCircle2, ChefHat, Bike, Loader2, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useParams, useNavigate } from "react-router-dom";
import { useStoreInfo } from "@/hooks/useStoreInfo";

type Order = {
  id: string;
  customer_name: string;
  phone: string;
  address: string;
  status: string;
  total: number;
  created_at: string;
  notes?: string;
};

const STATUS_STEPS = [
  { key: "pending",    label: "Recebido",   icon: Package,       color: "text-slate-500",  bg: "bg-slate-100"  },
  { key: "preparing",  label: "Separando",  icon: ChefHat,       color: "text-blue-600",   bg: "bg-blue-100"   },
  { key: "delivering", label: "Na Rota",    icon: Bike,          color: "text-amber-600",  bg: "bg-amber-100"  },
  { key: "delivered",  label: "Entregue",   icon: CheckCircle2,  color: "text-emerald-600",bg: "bg-emerald-100"},
];

function getStepIndex(status: string) {
  return STATUS_STEPS.findIndex(s => s.key === status);
}

function StatusTimeline({ status }: { status: string }) {
  const currentIdx = getStepIndex(status);

  return (
    <div className="mt-4 pt-4 border-t">
      <div className="flex items-center justify-between relative">
        {/* linha de progresso */}
        <div className="absolute left-0 right-0 top-5 h-1 bg-slate-100 mx-6 z-0" />
        <div
          className="absolute left-0 top-5 h-1 bg-emerald-400 z-0 transition-all duration-700"
          style={{ width: `${currentIdx === 0 ? 0 : (currentIdx / (STATUS_STEPS.length - 1)) * 100}%`, marginLeft: "1.5rem", marginRight: "1.5rem", maxWidth: "calc(100% - 3rem)" }}
        />

        {STATUS_STEPS.map((step, idx) => {
          const Icon = step.icon;
          const done = idx <= currentIdx;
          const active = idx === currentIdx;

          return (
            <div key={step.key} className="flex flex-col items-center gap-1.5 z-10 flex-1">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                done ? step.bg : "bg-slate-100"
              } ${active ? "ring-2 ring-offset-2 ring-emerald-400 scale-110" : ""}`}>
                <Icon className={`h-5 w-5 ${done ? step.color : "text-slate-300"}`} />
              </div>
              <span className={`text-[10px] font-bold text-center leading-tight ${done ? "text-slate-700" : "text-slate-300"}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Mensagem de status */}
      <div className="mt-4 text-center">
        {status === "pending" && <p className="text-sm text-slate-500">⏳ Aguardando confirmação da loja</p>}
        {status === "preparing" && <p className="text-sm text-blue-600 font-semibold">🧑‍🍳 Sua cesta está sendo separada!</p>}
        {status === "delivering" && <p className="text-sm text-amber-600 font-semibold">🛵 Entregador a caminho!</p>}
        {status === "delivered" && <p className="text-sm text-emerald-600 font-semibold">✅ Pedido entregue! Bom apetite 🥬</p>}
      </div>
    </div>
  );
}

function useRealtimeCustomerOrders(phone: string) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!phone) { setOrders([]); return; }

    setLoading(true);

    // Busca inicial
    supabase
      .from("orders")
      .select("*")
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setOrders(data as Order[]);
        setLoading(false);
      });

    // Realtime — atualiza status em tempo real
    const channel = supabase
      .channel(`customer-orders-${phone}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `phone=eq.${phone}` },
        (payload) => {
          setOrders(prev =>
            prev.map(o => o.id === payload.new.id ? { ...o, ...(payload.new as Order) } : o)
          );
          const newStatus = (payload.new as Order).status;
          const step = STATUS_STEPS.find(s => s.key === newStatus);
          if (step) toast.success(`Pedido atualizado: ${step.label}!`);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [phone]);

  return { orders, loading };
}

export default function OrderTracking() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { data: store } = useStoreInfo(slug);
  
  const [phone, setPhone] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const { orders, loading } = useRealtimeCustomerOrders(searchPhone);

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
      <header className="gradient-hero px-4 py-5 shadow-md">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center gap-3 mb-2">
            {store && (
              <>
                <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center overflow-hidden p-1.5">
                  <img 
                    src="/play_store_512.png" 
                    alt="Logo" 
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <h1 className="text-base font-extrabold text-white leading-tight">
                    {store.name}
                  </h1>
                  <p className="text-xs text-white/75">Rastreamento de Pedidos</p>
                </div>
              </>
            )}
            {!store && (
              <>
                <h1 className="text-xl font-extrabold text-white">Rastrear Pedido</h1>
              </>
            )}
          </div>
          <p className="text-sm text-white/90 mt-1">Acompanhe sua entrega em tempo real 📦</p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {/* Busca */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border mb-6">
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
              <div key={order.id} className="bg-white rounded-2xl p-5 shadow-sm border animate-slide-up">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs text-muted-foreground font-mono">#{order.id.split("-")[0]}</p>
                    <p className="font-bold text-lg text-foreground mt-0.5">{order.customer_name}</p>
                  </div>
                  <span className="text-2xl font-extrabold text-primary">
                    R$ {order.total.toFixed(2).replace(".", ",")}
                  </span>
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
                </div>

                {/* Timeline de status */}
                <StatusTimeline status={order.status} />

                {/* Observações */}
                {order.notes && (
                  <div className="mt-3 p-3 bg-slate-50 rounded-lg">
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
