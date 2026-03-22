import { useRealtimeOrders, updateOrderStatus } from "@/hooks/useOrders";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { ProductManager } from "@/components/admin/ProductManager";
import { BasketManager } from "@/components/admin/BasketManager";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Leaf, Package, Truck, CheckCircle, ShoppingBasket, Apple } from "lucide-react";
import { toast } from "sonner";

export default function Admin() {
  const { orders, loading } = useRealtimeOrders();

  const handleStatus = async (id: string, status: string) => {
    try {
      await updateOrderStatus(id, status);
      toast.success(`Status atualizado para ${status === "preparing" ? "Preparando" : "Entregue"}`);
    } catch {
      toast.error("Erro ao atualizar status");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-primary px-4 py-4 shadow-md">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Leaf className="h-8 w-8 text-primary-foreground" />
          <div>
            <h1 className="text-lg font-extrabold text-primary-foreground leading-tight">
              Painel Admin
            </h1>
            <p className="text-xs text-primary-foreground/80">BeiraRio Delivery</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <Tabs defaultValue="orders">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="orders" className="flex-1 gap-1">
              <Package className="h-4 w-4" /> Pedidos
            </TabsTrigger>
            <TabsTrigger value="products" className="flex-1 gap-1">
              <Apple className="h-4 w-4" /> Produtos
            </TabsTrigger>
            <TabsTrigger value="baskets" className="flex-1 gap-1">
              <ShoppingBasket className="h-4 w-4" /> Cestas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orders">
            <h2 className="text-xl font-extrabold text-foreground mb-4 flex items-center gap-2">
              <Package className="h-5 w-5" /> Pedidos ({orders.length})
            </h2>

            {loading && <p className="text-muted-foreground animate-pulse">Carregando pedidos...</p>}

            {!loading && orders.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="mx-auto h-12 w-12 mb-2 opacity-40" />
                <p>Nenhum pedido ainda</p>
              </div>
            )}

            <div className="space-y-3">
              {orders.map((order) => (
                <div key={order.id} className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-bold text-card-foreground">{order.customer_name}</p>
                      <p className="text-sm text-muted-foreground">{order.phone}</p>
                    </div>
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">📍 {order.address}</p>
                  <p className="text-lg font-extrabold text-primary">
                    R$ {order.total.toFixed(2).replace(".", ",")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(order.created_at).toLocaleString("pt-BR")}
                  </p>

                  {order.status !== "delivered" && (
                    <div className="flex gap-2 mt-3">
                      {order.status === "pending" && (
                        <Button size="sm" onClick={() => handleStatus(order.id, "preparing")} className="flex-1">
                          <Truck className="mr-1 h-4 w-4" /> Preparar
                        </Button>
                      )}
                      {(order.status === "pending" || order.status === "preparing") && (
                        <Button size="sm" variant="outline" onClick={() => handleStatus(order.id, "delivered")} className="flex-1">
                          <CheckCircle className="mr-1 h-4 w-4" /> Entregue
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="products">
            <ProductManager />
          </TabsContent>

          <TabsContent value="baskets">
            <BasketManager />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
