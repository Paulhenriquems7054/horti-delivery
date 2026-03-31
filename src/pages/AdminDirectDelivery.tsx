import { useState, useEffect } from "react";
import { useRealtimeDirectDeliveries, useCreateDirectDelivery, useSetDeliveryFee, useUpdateDirectDeliveryStatus } from "@/hooks/useDirectDelivery";
import { ArrowLeft, Plus, MapPin, Phone, DollarSign, Bike, CheckCircle2, Loader2, RefreshCw, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  pending_fee:       { label: "Aguardando taxa",    color: "text-slate-600",   bg: "bg-slate-100"   },
  awaiting_approval: { label: "Aguardando cliente", color: "text-amber-700",   bg: "bg-amber-100"   },
  approved:          { label: "Aprovado ✅",         color: "text-blue-700",    bg: "bg-blue-100"    },
  delivering:        { label: "Na Rota 🛵",          color: "text-orange-700",  bg: "bg-orange-100"  },
  delivered:         { label: "Entregue ✅",         color: "text-emerald-700", bg: "bg-emerald-100" },
  cancelled:         { label: "Cancelado",           color: "text-red-700",     bg: "bg-red-100"     },
};

export default function AdminDirectDelivery() {
  const navigate = useNavigate();
  const [storeId, setStoreId] = useState<string>("");
  const { deliveries, loading } = useRealtimeDirectDeliveries(storeId);
  const createDelivery = useCreateDirectDelivery();
  const setFee = useSetDeliveryFee();
  const updateStatus = useUpdateDirectDeliveryStatus();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customer_name: "", phone: "", address: "", total_purchase: "", notes: "" });
  const [feeInputs, setFeeInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      (supabase as any).from("stores").select("id").eq("user_id", data.user.id).maybeSingle()
        .then(({ data: s }: any) => { if (s) setStoreId(s.id); });
    });
  }, []);

  const handleCreate = async () => {
    if (!form.customer_name || !form.phone || !form.address) {
      toast.error("Preencha nome, telefone e endereço");
      return;
    }
    try {
      await createDelivery.mutateAsync({
        store_id: storeId,
        customer_name: form.customer_name,
        phone: form.phone.replace(/\D/g, ""),
        address: form.address,
        total_purchase: Number(form.total_purchase) || 0,
        notes: form.notes || undefined,
      });
      toast.success("Entrega direta criada!");
      setForm({ customer_name: "", phone: "", address: "", total_purchase: "", notes: "" });
      setShowForm(false);
    } catch { toast.error("Erro ao criar entrega"); }
  };

  const handleSetFee = async (id: string) => {
    const fee = Number(feeInputs[id]);
    if (!fee || fee <= 0) { toast.error("Informe uma taxa válida"); return; }
    try {
      await setFee.mutateAsync({ id, fee });
      toast.success("Taxa enviada ao cliente!");
      setFeeInputs(p => { const n = { ...p }; delete n[id]; return n; });
    } catch { toast.error("Erro ao definir taxa"); }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="gradient-hero px-4 py-5 shadow-md sticky top-0 z-10">
        <div className="mx-auto max-w-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/admin")} className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center text-white hover:bg-white/30">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-base font-extrabold text-white">Entrega Direta</h1>
              <p className="text-xs text-white/75">Cliente comprou na loja • solicita entrega</p>
            </div>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="h-9 px-4 rounded-xl bg-white text-primary font-bold text-sm flex items-center gap-2 hover:bg-white/90"
          >
            <Plus className="h-4 w-4" /> Nova
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5 space-y-4 pb-12">

        {/* Formulário nova entrega */}
        {showForm && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border space-y-3">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-extrabold text-foreground">Nova Entrega Direta</h2>
              <button onClick={() => setShowForm(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <input className="w-full h-11 px-3 border border-border rounded-xl text-sm" placeholder="Nome do cliente" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} />
            <input className="w-full h-11 px-3 border border-border rounded-xl text-sm" placeholder="Telefone / WhatsApp" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            <input className="w-full h-11 px-3 border border-border rounded-xl text-sm" placeholder="Endereço completo" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            <input className="w-full h-11 px-3 border border-border rounded-xl text-sm" placeholder="Valor total da compra (R$)" type="number" value={form.total_purchase} onChange={e => setForm(f => ({ ...f, total_purchase: e.target.value }))} />
            <textarea className="w-full px-3 py-2 border border-border rounded-xl text-sm resize-none" rows={2} placeholder="Observações (opcional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            <button onClick={handleCreate} disabled={createDelivery.isPending} className="w-full h-11 rounded-xl gradient-hero text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              {createDelivery.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar e Notificar Cliente"}
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12 gap-3">
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
            <p className="text-muted-foreground">Carregando...</p>
          </div>
        )}

        {!loading && deliveries.length === 0 && !showForm && (
          <div className="text-center py-16">
            <Bike className="h-14 w-14 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground font-semibold">Nenhuma entrega direta ativa</p>
            <p className="text-sm text-muted-foreground mt-1">Clique em "Nova" para registrar</p>
          </div>
        )}

        {deliveries.map(d => {
          const st = STATUS_LABEL[d.status] ?? STATUS_LABEL.pending_fee;
          return (
            <div key={d.id} className="bg-white rounded-2xl shadow-sm border overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <div>
                  <p className="font-extrabold text-foreground">{d.customer_name}</p>
                  <p className="text-xs text-muted-foreground font-mono">#{d.id.split("-")[0]}</p>
                </div>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${st.bg} ${st.color}`}>{st.label}</span>
              </div>

              <div className="p-4 space-y-3">
                {/* Endereço */}
                <div className="flex items-start gap-2 text-sm text-muted-foreground bg-slate-50 p-3 rounded-xl">
                  <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{d.address}</span>
                </div>

                {/* Valores */}
                <div className="flex gap-3 text-sm">
                  <div className="flex-1 bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground">Compra</p>
                    <p className="font-extrabold text-foreground">R$ {d.total_purchase.toFixed(2)}</p>
                  </div>
                  <div className="flex-1 bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground">Taxa Entrega</p>
                    <p className="font-extrabold text-foreground">
                      {d.delivery_fee != null ? `R$ ${d.delivery_fee.toFixed(2)}` : "—"}
                    </p>
                  </div>
                </div>

                {/* Ações por status */}
                {d.status === "pending_fee" && (
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Taxa (R$)"
                      value={feeInputs[d.id] || ""}
                      onChange={e => setFeeInputs(p => ({ ...p, [d.id]: e.target.value }))}
                      className="flex-1 h-10 px-3 border border-border rounded-xl text-sm"
                    />
                    <button
                      onClick={() => handleSetFee(d.id)}
                      disabled={setFee.isPending}
                      className="h-10 px-4 rounded-xl bg-primary text-white font-bold text-sm flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-60"
                    >
                      <DollarSign className="h-4 w-4" /> Enviar
                    </button>
                  </div>
                )}

                {d.status === "awaiting_approval" && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700 font-semibold text-center">
                    ⏳ Aguardando aprovação do cliente para a taxa de R$ {d.delivery_fee?.toFixed(2)}
                  </div>
                )}

                {d.status === "approved" && (
                  <button
                    onClick={() => updateStatus.mutateAsync({ id: d.id, status: "delivering" }).then(() => toast.success("Entrega iniciada!"))}
                    disabled={updateStatus.isPending}
                    className="w-full h-11 rounded-xl bg-amber-500 text-white font-bold flex items-center justify-center gap-2 hover:bg-amber-600"
                  >
                    <Bike className="h-4 w-4" /> Iniciar Entrega
                  </button>
                )}

                {d.status === "delivering" && (
                  <button
                    onClick={() => updateStatus.mutateAsync({ id: d.id, status: "delivered" }).then(() => toast.success("Entrega concluída!"))}
                    disabled={updateStatus.isPending}
                    className="w-full h-11 rounded-xl bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 hover:bg-emerald-600"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Confirmar Entrega
                  </button>
                )}

                {/* WhatsApp */}
                {["pending_fee","awaiting_approval","approved","delivering"].includes(d.status) && (
                  <a
                    href={`https://wa.me/55${d.phone.replace(/\D/g,"")}?text=${encodeURIComponent(
                      d.status === "awaiting_approval"
                        ? `Olá ${d.customer_name}! Sua entrega está pronta. A taxa de entrega é R$ ${d.delivery_fee?.toFixed(2)}. Acesse para aprovar: ${window.location.origin}/track`
                        : `Olá ${d.customer_name}! Atualização do seu pedido de entrega direta.`
                    )}`}
                    target="_blank" rel="noreferrer"
                    className="w-full h-10 rounded-xl bg-green-50 border border-green-200 text-green-700 font-bold text-sm flex items-center justify-center gap-2 hover:bg-green-100"
                  >
                    <Phone className="h-4 w-4" /> Notificar via WhatsApp
                  </a>
                )}

                {d.notes && (
                  <p className="text-xs text-muted-foreground bg-slate-50 p-2 rounded-lg">📝 {d.notes}</p>
                )}
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
