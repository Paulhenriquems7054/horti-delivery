import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Scale, Eye, PackageCheck, Camera, User, Weight, Play, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";
import { useRealtimeOrders, updateOrderStatus } from "@/hooks/useOrders";
import { WeighingModal } from "@/components/WeighingModal";
import { OrderDetailsModal } from "@/components/OrderDetailsModal";
import { ReceiptCameraModal } from "@/components/ReceiptCameraModal";
import { ReceiptValueModal } from "@/components/ReceiptValueModal";
import { ThemeToggle } from "@/components/ThemeToggle";

type RoleTab = "separator" | "scale";

export default function AdminPreparation() {
  const navigate = useNavigate();
  const { store } = useTenant();
  const { orders, loading } = useRealtimeOrders(store?.id);
  const [activeTab, setActiveTab] = useState<RoleTab>("separator");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [weighingOrder, setWeighingOrder] = useState<any | null>(null);
  const [detailsOrder, setDetailsOrder] = useState<any | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<any | null>(null);
  const [valueOrder, setValueOrder] = useState<any | null>(null);

  // Pedidos para Separador: status pending (aguardando separação)
  const separatorOrders = orders.filter((o) => o.status === "pending");
  
  // Pedidos para Balança: status preparing (em separação, precisa pesar)
  const scaleOrders = orders.filter((o) => o.status === "preparing");

  const handleStatus = async (orderId: string, status: string) => {
    setUpdatingId(orderId);
    try {
      await updateOrderStatus(orderId, status);
      toast.success(status === "preparing" ? "Separação iniciada" : "Pedido pronto para entrega");
    } catch {
      toast.error("Erro ao atualizar pedido");
    } finally {
      setUpdatingId(null);
    }
  };

  // Contadores para cada aba
  const pendingCount = separatorOrders.length;
  const preparingCount = scaleOrders.length;

  return (
    <div className="min-h-screen bg-background">
      <header className="gradient-hero px-4 py-5 shadow-md sticky top-0 z-20">
        <div className="mx-auto max-w-2xl flex items-center gap-3">
          <button
            onClick={() => navigate("/admin")}
            className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center text-white hover:bg-white/30 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-extrabold text-white leading-tight">Separação de Pedidos</h1>
            <p className="text-xs text-white/75">
              {activeTab === "separator" ? "Separar produtos dos pedidos" : "Pesar e registrar no caixa"}
            </p>
          </div>
          <ThemeToggle className="bg-white/20 text-white hover:bg-white/30" />
        </div>
      </header>

      {/* Abas de Seleção de Perfil */}
      <div className="sticky top-[73px] z-10 bg-background border-b border-border">
        <div className="mx-auto max-w-2xl px-4">
          <div className="flex gap-1 py-2">
            <button
              onClick={() => setActiveTab("separator")}
              className={`flex-1 h-12 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                activeTab === "separator"
                  ? "bg-blue-500 text-white shadow-md"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <User className="h-4 w-4" />
              Separador
              {pendingCount > 0 && (
                <span className="ml-1 px-2 py-0.5 bg-white/20 rounded-full text-xs">
                  {pendingCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("scale")}
              className={`flex-1 h-12 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                activeTab === "scale"
                  ? "bg-amber-500 text-white shadow-md"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <Weight className="h-4 w-4" />
              Balança
              {preparingCount > 0 && (
                <span className="ml-1 px-2 py-0.5 bg-white/20 rounded-full text-xs">
                  {preparingCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-2xl px-4 py-6 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-16 gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Carregando pedidos...</p>
          </div>
        )}

        {/* ABA SEPARADOR */}
        {activeTab === "separator" && (
          <>
            {!loading && separatorOrders.length === 0 && (
              <div className="rounded-2xl border border-border bg-card p-8 text-center">
                <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <PackageCheck className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="font-bold text-foreground text-lg">Nenhum pedido aguardando separação</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Todos os pedidos pendentes já foram iniciados
                </p>
              </div>
            )}

            {separatorOrders.map((order) => (
              <div key={order.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="font-extrabold text-foreground text-lg">{order.customer_name}</p>
                    <p className="text-xs text-muted-foreground font-mono">#{order.id.split("-")[0]}</p>
                  </div>
                  <span className="text-lg font-extrabold text-primary">
                    R$ {order.total.toFixed(2).replace(".", ",")}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground bg-muted p-2 rounded-lg border border-border">
                  {order.address}
                </p>

                {/* Botões do Separador */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setDetailsOrder(order)}
                    className="h-11 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center gap-1 hover:bg-slate-200"
                  >
                    <Eye className="h-4 w-4" /> Ver
                  </button>
                  <button
                    onClick={() => setReceiptOrder(order)}
                    className="h-11 rounded-lg bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center gap-1 hover:bg-purple-200"
                  >
                    <Camera className="h-4 w-4" /> Cupom
                  </button>
                  <button
                    onClick={() => handleStatus(order.id, "preparing")}
                    disabled={updatingId === order.id}
                    className="h-11 rounded-lg bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center gap-1 hover:bg-blue-200 disabled:opacity-60"
                  >
                    <Play className="h-4 w-4" />
                    {updatingId === order.id ? "..." : "Iniciar"}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ABA BALANÇA */}
        {activeTab === "scale" && (
          <>
            {!loading && scaleOrders.length === 0 && (
              <div className="rounded-2xl border border-border bg-card p-8 text-center">
                <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <Scale className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="font-bold text-foreground text-lg">Nenhum pedido na balança</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Aguardando pedidos iniciarem a separação
                </p>
              </div>
            )}

            {scaleOrders.map((order) => (
              <div key={order.id} className="rounded-2xl border-2 border-amber-200 bg-amber-50/30 dark:bg-amber-950/10 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-extrabold text-foreground text-lg">{order.customer_name}</p>
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">
                        Separando
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">#{order.id.split("-")[0]}</p>
                  </div>
                  <span className="text-lg font-extrabold text-amber-600">
                    R$ {order.total.toFixed(2).replace(".", ",")}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground bg-white dark:bg-card p-2 rounded-lg border border-amber-200">
                  {order.address}
                </p>

                {/* Botões da Balança */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setDetailsOrder(order)}
                    className="h-11 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center gap-1 hover:bg-slate-200"
                  >
                    <Eye className="h-4 w-4" /> Ver Itens
                  </button>
                  <button
                    onClick={() => setWeighingOrder(order)}
                    className="h-11 rounded-lg bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center gap-1 hover:bg-amber-200"
                  >
                    <Scale className="h-4 w-4" /> Pesar
                  </button>
                  <button
                    onClick={() => setValueOrder(order)}
                    className="h-11 rounded-lg bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center gap-1 hover:bg-blue-200"
                  >
                    <DollarSign className="h-4 w-4" /> Valor Cupom
                  </button>
                  <button
                    onClick={() => handleStatus(order.id, "ready_for_delivery")}
                    disabled={updatingId === order.id}
                    className="h-11 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center gap-1 hover:bg-emerald-200 disabled:opacity-60"
                  >
                    <PackageCheck className="h-4 w-4" />
                    {updatingId === order.id ? "..." : "Pronto"}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </main>

      {/* Modais */}
      <WeighingModal
        order={weighingOrder}
        onClose={() => setWeighingOrder(null)}
        onUpdate={() => {
          setWeighingOrder(null);
        }}
      />

      <OrderDetailsModal
        order={detailsOrder}
        onClose={() => setDetailsOrder(null)}
      />

      {receiptOrder && (
        <ReceiptCameraModal
          orderId={receiptOrder.id}
          customerName={receiptOrder.customer_name}
          orderTotal={receiptOrder.total}
          onClose={() => setReceiptOrder(null)}
          onSuccess={() => {
            setReceiptOrder(null);
            toast.success("Cupom fiscal registrado com sucesso!");
          }}
        />
      )}

      {valueOrder && (
        <ReceiptValueModal
          orderId={valueOrder.id}
          customerName={valueOrder.customer_name}
          orderTotal={valueOrder.total}
          onClose={() => setValueOrder(null)}
          onSuccess={() => {
            setValueOrder(null);
            toast.success("Valor do cupom registrado com sucesso!");
          }}
        />
      )}
    </div>
  );
}
