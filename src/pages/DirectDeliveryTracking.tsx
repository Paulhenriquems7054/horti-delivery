import { useState } from "react";
import { useCustomerDirectDelivery, useRespondToFee } from "@/hooks/useDirectDelivery";
import { Search, Package, MapPin, Clock, CheckCircle2, Bike, ChefHat, Loader2, DollarSign } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const STATUS_STEPS = [
  { key: "pending_fee",       label: "Registrado",   icon: Package      },
  { key: "awaiting_approval", label: "Taxa enviada", icon: DollarSign   },
  { key: "approved",          label: "Aprovado",     icon: CheckCircle2 },
  { key: "delivering",        label: "Na Rota",      icon: Bike         },
  { key: "delivered",         label: "Entregue",     icon: CheckCircle2 },
];

function getStepIdx(status: string) {
  return STATUS_STEPS.findIndex(s => s.key === status);
}

export default function DirectDeliveryTracking() {
  const [phone, setPhone] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const { deliveries, loading } = useCustomerDirectDelivery(searchPhone);
  const respond = useRespondToFee();

  const handleSearch = () => {
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 10) { toast.error("Digite um telefone válido"); return; }
    setSearchPhone(clean);
  };

  const handleRespond = async (id: string, approved: boolean) => {
    try {
      await respond.mutateAsync({ id, approved });
      toast.success(approved ? "Taxa aprovada! Entrega confirmada 🛵" : "Entrega cancelada.");
    } catch { toast.error("Erro ao responder"); }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="gradient-hero px-4 py-5 shadow-md">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-xl font-extrabold text-white">Entrega Direta</h1>
          <p className="text-sm text-white/75 mt-1">Acompanhe sua entrega em tempo real</p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <div className="bg-white rounded-2xl p-5 shadow-sm border mb-6">
          <p className="text-sm font-bold text-foreground mb-3">Digite o telefone usado na compra</p>
          <div className="flex gap-2">
            <Input placeholder="(11) 99999-9999" value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()} autoComplete="tel" />
            <Button onClick={handleSearch} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {!loading && searchPhone && deliveries.length === 0 && (
          <div className="text-center py-12">
            <Package className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-xl font-bold text-foreground mb-2">Nenhuma entrega encontrada</p>
            <p className="text-muted-foreground text-sm">Verifique o telefone ou aguarde o registro pelo estabelecimento</p>
          </div>
        )}

        {deliveries.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground font-semibold">
              {deliveries.length} entrega(s) • atualização automática 🟢
            </p>

            {deliveries.map(d => {
              const currentIdx = getStepIdx(d.status);

              return (
                <div key={d.id} className="bg-white rounded-2xl p-5 shadow-sm border">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-xs text-muted-foreground font-mono">#{d.id.split("-")[0]}</p>
                      <p className="font-bold text-lg text-foreground mt-0.5">{d.customer_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Compra</p>
                      <p className="font-extrabold text-foreground">R$ {d.total_purchase.toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Endereço */}
                  <div className="flex items-start gap-2 text-sm text-muted-foreground bg-slate-50 p-3 rounded-xl mb-4">
                    <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{d.address}</span>
                  </div>

                  {/* Timeline */}
                  <div className="flex items-center justify-between relative mb-2">
                    <div className="absolute left-0 right-0 top-5 h-1 bg-slate-100 mx-5 z-0" />
                    <div
                      className="absolute left-0 top-5 h-1 bg-emerald-400 z-0 transition-all duration-700"
                      style={{
                        width: currentIdx <= 0 ? "0%" : `${(currentIdx / (STATUS_STEPS.length - 1)) * 100}%`,
                        marginLeft: "1.25rem", maxWidth: "calc(100% - 2.5rem)"
                      }}
                    />
                    {STATUS_STEPS.map((step, idx) => {
                      const Icon = step.icon;
                      const done = idx <= currentIdx;
                      const active = idx === currentIdx;
                      return (
                        <div key={step.key} className="flex flex-col items-center gap-1 z-10 flex-1">
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center transition-all ${done ? "bg-emerald-100" : "bg-slate-100"} ${active ? "ring-2 ring-offset-1 ring-emerald-400 scale-110" : ""}`}>
                            <Icon className={`h-5 w-5 ${done ? "text-emerald-600" : "text-slate-300"}`} />
                          </div>
                          <span className={`text-[9px] font-bold text-center leading-tight ${done ? "text-slate-700" : "text-slate-300"}`}>{step.label}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Ação: aprovar taxa */}
                  {d.status === "awaiting_approval" && d.delivery_fee != null && (
                    <div className="mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
                      <div className="text-center">
                        <p className="text-sm font-bold text-amber-800">O estabelecimento calculou a taxa de entrega:</p>
                        <p className="text-3xl font-extrabold text-amber-700 mt-1">R$ {d.delivery_fee.toFixed(2)}</p>
                        <p className="text-xs text-amber-600 mt-1">Aprove para confirmar a entrega</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRespond(d.id, false)}
                          disabled={respond.isPending}
                          className="flex-1 h-11 rounded-xl border border-red-200 text-red-600 font-bold text-sm hover:bg-red-50"
                        >
                          Recusar
                        </button>
                        <button
                          onClick={() => handleRespond(d.id, true)}
                          disabled={respond.isPending}
                          className="flex-1 h-11 rounded-xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600 flex items-center justify-center gap-2"
                        >
                          {respond.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "✅ Aprovar e Confirmar"}
                        </button>
                      </div>
                    </div>
                  )}

                  {d.status === "delivering" && (
                    <div className="mt-3 text-center">
                      <p className="text-sm font-bold text-amber-600">🛵 Entregador a caminho!</p>
                    </div>
                  )}

                  {d.status === "delivered" && (
                    <div className="mt-3 text-center">
                      <p className="text-sm font-bold text-emerald-600">✅ Entrega concluída! Bom proveito 🥬</p>
                    </div>
                  )}

                  {d.status === "cancelled" && (
                    <div className="mt-3 text-center">
                      <p className="text-sm font-bold text-red-500">❌ Entrega cancelada</p>
                    </div>
                  )}

                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {new Date(d.created_at).toLocaleString("pt-BR")}
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
