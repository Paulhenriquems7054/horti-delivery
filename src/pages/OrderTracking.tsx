import { useState } from "react";
import { useCustomerOrders } from "@/hooks/useOrderTracking";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Package, MapPin, Clock, Phone } from "lucide-react";
import { toast } from "sonner";

export default function OrderTracking() {
  const [phone, setPhone] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const { data: orders, isLoading } = useCustomerOrders(searchPhone);

  const handleSearch = () => {
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      toast.error("Digite um telefone válido");
      return;
    }
    setSearchPhone(cleanPhone);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="gradient-hero px-4 py-5 shadow-md">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-xl font-extrabold text-white">Rastrear Pedidos</h1>
          <p className="text-sm text-white/75 mt-1">Consulte seus pedidos pelo telefone</p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <div className="bg-white rounded-2xl p-5 shadow-sm border mb-6">
          <div className="flex gap-2">
            <Input
              placeholder="Digite seu telefone (11) 99999-9999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={isLoading}>
              <Search className="h-4 w-4 mr-2" />
              Buscar
            </Button>
          </div>
        </div>

        {isLoading && (
          <div className="text-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-muted-foreground">Buscando pedidos...</p>
          </div>
        )}

        {!isLoading && searchPhone && orders?.length === 0 && (
          <div className="text-center py-12">
            <Package className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-2">Nenhum pedido encontrado</h2>
            <p className="text-muted-foreground">Verifique se o telefone está correto</p>
          </div>
        )}

        {orders && orders.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-extrabold text-foreground">
              {orders.length} pedido(s) encontrado(s)
            </h2>
            {orders.map((order) => (
              <div key={order.id} className="bg-white rounded-2xl p-5 shadow-sm border">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs text-muted-foreground font-mono">#{order.id.split("-")[0]}</p>
                    <p className="font-bold text-lg text-foreground mt-1">{order.customer_name}</p>
                  </div>
                  <OrderStatusBadge status={order.status} />
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{order.address}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{order.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {new Date(order.created_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total</span>
                  <span className="text-2xl font-extrabold text-primary">
                    R$ {order.total.toFixed(2).replace(".", ",")}
                  </span>
                </div>

                {order.notes && (
                  <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Observações:</p>
                    <p className="text-sm text-foreground">{order.notes}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
