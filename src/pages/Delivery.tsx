import { useState } from "react";import { useParams, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, CheckCircle2, Phone, Package, Loader2, LogOut, Bike, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/ThemeToggle";

type Order = {
  id: string;
  customer_name: string;
  phone: string;
  address: string;
  total: number;
  status: string;
  created_at: string;
  notes?: string;
};

type StoreInfo = {
  id: string;
  name: string;
  slug: string;
  delivery_pin: string;
};

function useStoreBySlug(slug: string) {
  return useQuery({
    queryKey: ["delivery-store", slug],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("stores")
        .select("id, name, slug, delivery_pin")
        .eq("slug", slug)
        .eq("active", true)
        .maybeSingle();
      if (error) throw error;
      return data as StoreInfo | null;
    },
  });
}

function useDeliveryOrders(storeId?: string) {
  return useQuery({
    queryKey: ["delivery-orders", storeId],
    queryFn: async () => {
      if (!storeId) return [];
      const { data, error } = await (supabase as any)
        .from("orders")
        .select("*")
        .eq("store_id", storeId)
        .in("status", ["ready_for_delivery", "delivering"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Order[];
    },
    enabled: !!storeId,
    refetchInterval: 15_000,
  });
}

function useStartDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase
        .from("orders")
        .update({ status: "delivering" })
        .eq("id", orderId);
      if (error) throw error;
      await (supabase as any).from("order_tracking").insert({
        order_id: orderId,
        status: "delivering",
        notes: "Pedido saiu para entrega",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-orders"] });
      toast.success("Rota iniciada! 🛵");
    },
    onError: () => toast.error("Erro ao iniciar rota"),
  });
}

function useMarkDelivered() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase
        .from("orders")
        .update({ status: "delivered" })
        .eq("id", orderId);
      if (error) throw error;
      await (supabase as any).from("order_tracking").insert({
        order_id: orderId,
        status: "delivered",
        notes: "Entrega confirmada pelo entregador",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-orders"] });
      toast.success("Entrega confirmada! ✅");
    },
    onError: () => toast.error("Erro ao confirmar entrega"),
  });
}

// ─── PIN Screen ───────────────────────────────────────────────────────────────
function PinScreen({ storeName, onUnlock }: { storeName: string; onUnlock: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const handleDigit = (d: string) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError(false);
    if (next.length === 4) {
      onUnlock(next);
      // reset after short delay to allow parent to decide
      setTimeout(() => setPin(""), 300);
    }
  };

  const handleDelete = () => { setPin(p => p.slice(0, -1)); setError(false); };

  // Allow parent to signal error
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 relative">
      {/* Theme Toggle - Canto superior direito */}
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle className="bg-slate-800 text-slate-300 hover:bg-slate-700" />
      </div>

      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="h-16 w-16 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-lg">
          <Bike className="h-9 w-9 text-white" />
        </div>
        <h1 className="text-2xl font-extrabold text-white">Área do Entregador</h1>
        <p className="text-slate-400 text-sm text-center">{storeName}</p>
        <p className="text-slate-500 text-xs">Digite o PIN de acesso</p>
      </div>

      <div className="flex gap-4 mb-8">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`h-4 w-4 rounded-full transition-all duration-150 ${
            i < pin.length ? (error ? "bg-red-500" : "bg-emerald-400") : "bg-slate-600"
          }`} />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d, i) => (
          <button
            key={i}
            onClick={() => d === "⌫" ? handleDelete() : d !== "" ? handleDigit(d) : null}
            disabled={d === ""}
            className={`h-16 rounded-2xl text-xl font-bold transition-all active:scale-95 ${
              d === "" ? "invisible" :
              d === "⌫" ? "bg-slate-700 text-slate-300 hover:bg-slate-600" :
              "bg-slate-700 text-white hover:bg-slate-600"
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {error && <p className="mt-6 text-red-400 font-bold text-sm animate-pulse">PIN incorreto</p>}
    </div>
  );
}

// ─── Order Card ───────────────────────────────────────────────────────────────
function OrderCard({ order }: { order: Order }) {
  const [confirming, setConfirming] = useState(false);
  const markDelivered = useMarkDelivered();
  const startDelivery = useStartDelivery();
  const isReady = order.status === "ready_for_delivery";

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="bg-amber-50 border-b border-amber-100 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-amber-600" />
          <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">
            {isReady ? "Pronto para rota" : "Na Rota"}
          </span>
        </div>
        <span className="text-xs text-slate-400 font-mono">#{order.id.split("-")[0]}</span>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <p className="font-extrabold text-lg text-slate-800">{order.customer_name}</p>
          <p className="text-2xl font-black text-emerald-600 mt-0.5">
            R$ {order.total.toFixed(2).replace(".", ",")}
          </p>
        </div>

        <div className="flex items-start gap-2 bg-slate-50 rounded-xl p-3 border border-slate-100">
          <MapPin className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
          <p className="text-sm text-slate-700 font-medium leading-snug">{order.address}</p>
        </div>

        {order.notes && (
          <div className="bg-yellow-50 rounded-xl p-3 border border-yellow-100">
            <p className="text-xs font-bold text-yellow-700 mb-1">Observação:</p>
            <p className="text-sm text-yellow-800">{order.notes}</p>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <a
            href={`https://wa.me/55${order.phone.replace(/\D/g, "")}`}
            target="_blank" rel="noreferrer"
            className="flex-1 h-11 rounded-xl bg-green-50 border border-green-200 text-green-700 font-bold text-sm flex items-center justify-center gap-2 hover:bg-green-100 transition-colors"
          >
            <Phone className="h-4 w-4" /> WhatsApp
          </a>
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(order.address)}`}
            target="_blank" rel="noreferrer"
            className="flex-1 h-11 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 font-bold text-sm flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors"
          >
            <MapPin className="h-4 w-4" /> Mapa
          </a>
        </div>

        {isReady ? (
          <button
            onClick={() => startDelivery.mutate(order.id)}
            disabled={startDelivery.isPending}
            className="w-full h-14 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-extrabold text-base flex items-center justify-center gap-2 transition-colors shadow-md active:scale-[0.98] disabled:opacity-60"
          >
            {startDelivery.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Bike className="h-5 w-5" />}
            Iniciar Entrega
          </button>
        ) : !confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="w-full h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-base flex items-center justify-center gap-2 transition-colors shadow-md active:scale-[0.98]"
          >
            <CheckCircle2 className="h-5 w-5" /> Confirmar Entrega
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-center text-sm font-bold text-slate-600">Confirmar que entregou?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 h-12 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => markDelivered.mutate(order.id)}
                disabled={markDelivered.isPending}
                className="flex-1 h-12 rounded-xl bg-emerald-500 text-white font-extrabold text-sm flex items-center justify-center gap-2 hover:bg-emerald-600 disabled:opacity-60"
              >
                {markDelivered.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "✅ Sim, entregue!"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Delivery() {
  const params = useParams<{ slug?: string }>();
  // suporta tanto /:slug/delivery quanto /delivery/:slug
  const slug = params.slug;
  const [unlocked, setUnlocked] = useState(false);
  const [pinError, setPinError] = useState(false);

  const { data: store, isLoading: storeLoading } = useStoreBySlug(slug ?? "");
  const { data: orders = [], isLoading: ordersLoading, refetch } = useDeliveryOrders(
    unlocked ? store?.id : undefined
  );

  if (!slug) return <Navigate to="/" replace />;

  if (storeLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 gap-4">
        <Bike className="h-12 w-12 text-slate-500" />
        <p className="text-slate-400 font-bold text-lg">Loja não encontrada</p>
        <p className="text-slate-500 text-sm">Verifique o link com o seu gestor</p>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <PinScreen
        storeName={store.name}
        onUnlock={(enteredPin: string) => {
          if (enteredPin === store.delivery_pin) {
            setUnlocked(true);
          } else {
            setPinError(true);
            setTimeout(() => setPinError(false), 1000);
          }
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 px-4 py-4 sticky top-0 z-10 shadow-md">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-500 flex items-center justify-center">
              <Bike className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-white leading-tight">{store.name}</h1>
              <p className="text-xs text-slate-400">
                {orders.length} pedido{orders.length !== 1 ? "s" : ""} na rota
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle className="bg-slate-700 text-slate-300 hover:bg-slate-600" />
            <button
              onClick={() => refetch()}
              className="h-9 w-9 rounded-xl bg-slate-700 flex items-center justify-center text-slate-300 hover:bg-slate-600 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={() => setUnlocked(false)}
              className="h-9 w-9 rounded-xl bg-slate-700 flex items-center justify-center text-slate-300 hover:bg-slate-600 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-4 pb-12">
        {ordersLoading && (
          <div className="flex items-center justify-center py-16 gap-3">
            <Loader2 className="h-6 w-6 text-emerald-500 animate-spin" />
            <p className="text-slate-500 font-semibold">Carregando entregas...</p>
          </div>
        )}

        {!ordersLoading && orders.length === 0 && (
          <div className="text-center py-16">
            <div className="h-20 w-20 rounded-full bg-slate-200 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-10 w-10 text-slate-400" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-700 mb-2">Tudo entregue!</h2>
            <p className="text-slate-500 text-sm">Nenhum pedido na rota no momento.</p>
          </div>
        )}

        {orders.map(order => (
          <OrderCard key={order.id} order={order} />
        ))}
      </main>
    </div>
  );
}
