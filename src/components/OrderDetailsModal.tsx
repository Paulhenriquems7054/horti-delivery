import { useEffect, useMemo, useState } from "react";
import { X, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sellsByUnitFixedPrice } from "@/utils/priceEstimation";

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
  product_unit?: string | null;
  product_sell_by?: "unit" | "weight" | "both" | null;
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

  const formatWeight = (weightKg: number): string => {
    if (weightKg < 1) return `${Math.round(weightKg * 1000)}g`;
    return `${weightKg.toFixed(2).replace(".", ",")}kg`;
  };

  const getItemLineTotal = (item: OrderDetailsItem): number => {
    if (item.sold_by === "weight") {
      return item.final_price ?? item.price ?? 0;
    }
    // Para venda por unidade, "price" representa valor unitário.
    // Se houver final_price (caso especial), ele tem prioridade.
    if (typeof item.final_price === "number") {
      return item.final_price;
    }
    return (item.quantity || 0) * (item.price || 0);
  };

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
          product:products(name, unit, sell_by)
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
            product_unit: item.product?.unit,
            product_sell_by: item.product?.sell_by,
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
    () => items.reduce((sum, item) => sum + getItemLineTotal(item), 0),
    [items]
  );
  const computedOrderTotal = useMemo(
    () => Math.max(0, itemsTotal + (order?.delivery_fee || 0) - (order?.discount || 0)),
    [itemsTotal, order?.delivery_fee, order?.discount]
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
                  {/*
                    Exibe "(a pesar)" somente quando realmente precisa de pesagem.
                    Produtos de valor fixo por unidade nunca entram nesse estado.
                  */}
                  {(() => {
                    const isFixedUnit = sellsByUnitFixedPrice({
                      sell_by: item.product_sell_by ?? item.sold_by,
                      unit: item.product_unit ?? null,
                    });
                    const shouldShowNeedsWeighing = Boolean(item.needs_weighing) && !isFixedUnit;

                    return (
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.sold_by === "weight"
                          ? `${formatWeight(item.weight_kg || 0)} x R$ ${(item.price / (item.weight_kg || 1)).toFixed(2).replace(".", ",")}`
                          : shouldShowNeedsWeighing
                            ? `${item.quantity} unidade(s) (a pesar)`
                            : `${item.quantity} unidade(s)`}
                      </p>
                    </div>
                    <p className="font-bold text-primary">R$ {getItemLineTotal(item).toFixed(2)}</p>
                  </div>
                    );
                  })()}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="p-4 border-t border-border bg-muted/50 space-y-1">
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
            <span>R$ {computedOrderTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
