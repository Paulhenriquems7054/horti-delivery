import { useEffect, useMemo, useState } from "react";
import { X, Package, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useReprintOrder } from "@/hooks/useCreateOrder";
import { toast } from "sonner";

interface OrderDetailsItem {
  id: string;
  quantity: number;
  price: number;
  sold_by: "unit" | "weight";
  weight_kg?: number | null;
  actual_weight_kg?: number | null;
  final_price?: number | null;
  needs_weighing?: boolean | null;
  product_name: string;
  item_notes?: string | null;
}

interface OrderDetailsOrder {
  id: string;
  customer_name: string;
  phone: string;
  address: string;
  total: number;
  delivery_fee?: number;
  discount?: number;
}

interface Props {
  order: OrderDetailsOrder | null;
  onClose: () => void;
}

export function OrderDetailsModal({ order, onClose }: Props) {
  const [items, setItems] = useState<OrderDetailsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const reprint = useReprintOrder();

  useEffect(() => {
    const loadItems = async () => {
      if (!order) return;
      setLoading(true);

      const { data, error } = await supabase
        .from("order_items")
        .select(`
          id,
          quantity,
          price,
          sold_by,
          weight_kg,
          actual_weight_kg,
          final_price,
          needs_weighing,
          item_notes,
          product:products(name)
        `)
        .eq("order_id", order.id);

      if (!error && data) {
        setItems(
          data.map((item: any) => ({
            id: item.id,
            quantity: item.quantity || 1,
            price: item.price || 0,
            sold_by: item.sold_by || "unit",
            weight_kg: item.weight_kg,
            actual_weight_kg: item.actual_weight_kg,
            final_price: item.final_price,
            needs_weighing: item.needs_weighing,
            product_name: item.product?.name || "Produto",
            item_notes: item.item_notes,
          }))
        );
      } else {
        setItems([]);
      }

      setLoading(false);
    };

    loadItems();
  }, [order]);

  const itemsTotal = useMemo(
    () => items.reduce((sum, item) => sum + (item.final_price || item.price || 0), 0),
    [items]
  );

  if (!order) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card w-full max-w-2xl rounded-2xl border border-border shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-foreground">Detalhes do Pedido</h2>
            <p className="text-xs text-muted-foreground">#{order.id.split("-")[0]} - {order.customer_name}</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-lg hover:bg-muted flex items-center justify-center">
            <X className="h-5 w-5 text-foreground" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          <div className="rounded-xl bg-muted/50 border border-border p-3">
            <p className="text-xs text-muted-foreground">Cliente</p>
            <p className="font-bold text-foreground">{order.customer_name}</p>
            <p className="text-sm text-muted-foreground">{order.phone}</p>
            <p className="text-sm text-muted-foreground mt-1">{order.address}</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-bold text-foreground flex items-center gap-2">
              <Package className="h-4 w-4" />
              Itens do pedido
            </p>
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando itens...</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum item encontrado.</p>
            ) : (
              items.map((item) => (
                <div key={item.id} className="rounded-lg border border-border p-3 bg-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.sold_by === "weight"
                          ? `${item.weight_kg || 0}kg x R$ ${(item.price / (item.weight_kg || 1)).toFixed(2)}`
                          : item.needs_weighing
                            ? `${item.quantity} unidade(s) (a pesar)`
                            : `${item.quantity} unidade(s)`}
                      </p>
                      {item.item_notes?.trim() && (
                        <p className="text-xs text-amber-700 mt-1">
                          Obs: {item.item_notes.trim()}
                        </p>
                      )}
                    </div>
                    <p className="font-bold text-primary">R$ {(item.final_price || item.price || 0).toFixed(2)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="p-4 border-t border-border bg-muted/50 space-y-2">
          <button
            type="button"
            disabled={reprint.isPending}
            onClick={() => {
              reprint.mutate(order.id, {
                onSuccess: () => toast.success("Pedido enviado para reimpressão."),
                onError: () => toast.error("Não foi possível solicitar a reimpressão."),
              });
            }}
            className="w-full h-10 rounded-xl border border-border bg-card text-sm font-bold flex items-center justify-center gap-2 hover:bg-muted disabled:opacity-60"
          >
            <Printer className="h-4 w-4" />
            {reprint.isPending ? "Enviando…" : "Reimprimir pedido"}
          </button>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Subtotal itens</span>
            <span>R$ {itemsTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Taxa entrega</span>
            <span>R$ {(order.delivery_fee || 0).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Desconto</span>
            <span>- R$ {(order.discount || 0).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-base font-extrabold text-foreground pt-1 border-t border-border">
            <span>Total pedido</span>
            <span>R$ {(order.total || 0).toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
