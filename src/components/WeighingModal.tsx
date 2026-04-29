import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, Scale, Save, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface OrderItem {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
  sold_by: 'unit' | 'weight';
  weight_kg?: number;
  needs_weighing?: boolean;
  actual_weight_kg?: number;
  final_price?: number;
  price_per_kg?: number;
}

interface Order {
  id: string;
  customer_name: string;
  phone: string;
  address: string;
  total: number;
  status: string;
}

interface WeighingModalProps {
  order: Order | null;
  onClose: () => void;
  onUpdate: () => void;
}

export function WeighingModal({ order, onClose, onUpdate }: WeighingModalProps) {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weights, setWeights] = useState<Record<string, string>>({});

  useEffect(() => {
    if (order) {
      loadOrderItems();
    }
  }, [order]);

  const loadOrderItems = async () => {
    if (!order) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("order_items")
        .select(`
          id,
          product_id,
          quantity,
          price,
          sold_by,
          weight_kg,
          needs_weighing,
          actual_weight_kg,
          final_price,
          product:products (
            name,
            price_per_kg,
            price
          )
        `)
        .eq("order_id", order.id);

      if (error) throw error;

      const formattedItems = data.map((item: any) => ({
        id: item.id,
        product_id: item.product_id,
        product_name: item.product?.name || 'Produto',
        quantity: item.quantity,
        price: item.price,
        sold_by: item.sold_by || 'unit',
        weight_kg: item.weight_kg,
        needs_weighing: item.needs_weighing,
        actual_weight_kg: item.actual_weight_kg,
        final_price: item.final_price,
        price_per_kg: item.product?.price_per_kg || item.product?.price || 0,
      }));

      setItems(formattedItems);

      // Inicializa pesos com valores existentes ou vazios
      const initialWeights: Record<string, string> = {};
      formattedItems.forEach((item: any) => {
        if (item.needs_weighing) {
          initialWeights[item.id] = item.actual_weight_kg?.toString() || '';
        }
      });
      setWeights(initialWeights);
    } catch (error) {
      console.error('Erro ao carregar itens:', error);
      toast.error('Erro ao carregar itens do pedido');
    } finally {
      setLoading(false);
    }
  };

  const handleWeightChange = (itemId: string, value: string) => {
    // Permite apenas números e ponto decimal
    const sanitized = value.replace(/[^0-9.]/g, '');
    setWeights(prev => ({ ...prev, [itemId]: sanitized }));
  };

  const calculateItemPrice = (item: any, weightKg: number) => {
    const pricePerKg = item.price_per_kg || item.price;
    return weightKg * pricePerKg;
  };

  const formatWeight = (weightKg?: number | null) => {
    if (!weightKg || weightKg <= 0) return "0g";
    if (weightKg < 1) return `${Math.round(weightKg * 1000)}g`;
    return `${weightKg.toFixed(2).replace(".", ",")}kg`;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Atualiza cada item que precisa ser pesado
      const updates = items
        .filter(item => item.needs_weighing)
        .map(item => {
          const weightKg = parseFloat(weights[item.id] || '0');
          if (weightKg <= 0) return null;

          const finalPrice = calculateItemPrice(item, weightKg);

          return supabase
            .from("order_items")
            .update({
              actual_weight_kg: weightKg,
              final_price: finalPrice,
              needs_weighing: false, // Marca como já pesado
            })
            .eq("id", item.id);
        })
        .filter(Boolean);

      // Executa todas as atualizações
      await Promise.all(updates);

      // Recalcula o total do pedido
      const { data: allItems } = await supabase
        .from("order_items")
        .select("price, final_price, sold_by")
        .eq("order_id", order!.id);

      const newTotal = allItems?.reduce((sum, item) => {
        // Usa final_price se disponível (itens pesados), senão usa price (itens por peso)
        return sum + (item.final_price || item.price);
      }, 0) || 0;

      // Atualiza o total do pedido
      await supabase
        .from("orders")
        .update({ total: newTotal })
        .eq("id", order!.id);

      // Registra no histórico de pesagem (se a tabela existir)
      const weighingHistory = items
        .filter(item => item.needs_weighing && weights[item.id])
        .map(item => ({
          order_id: order!.id,
          order_item_id: item.id,
          product_id: item.product_id,
          quantity: item.quantity,
          weight_kg: parseFloat(weights[item.id]),
          price_per_kg: item.price_per_kg || item.price,
          final_price: calculateItemPrice(item, parseFloat(weights[item.id])),
        }));

      if (weighingHistory.length > 0) {
        // Tenta inserir no histórico, mas não falha se a tabela não existir
        try {
          await (supabase as any).from("weighing_history").insert(weighingHistory);
        } catch (historyError) {
          console.log('Histórico de pesagem não disponível:', historyError);
        }
      }

      toast.success(`Pesagem concluída! Total atualizado: R$ ${newTotal.toFixed(2)}`);
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Erro ao salvar pesagem:', error);
      toast.error('Erro ao salvar pesagem');
    } finally {
      setSaving(false);
    }
  };

  const itemsNeedingWeighing = items.filter(item => item.needs_weighing);
  const itemsAlreadyWeighed = items.filter(item => !item.needs_weighing && item.sold_by === 'unit');
  const itemsByWeight = items.filter(item => item.sold_by === 'weight');

  const canSave = itemsNeedingWeighing.every(item => {
    const weight = parseFloat(weights[item.id] || '0');
    return weight > 0;
  });

  const estimatedTotal = items.reduce((sum, item) => {
    if (item.needs_weighing) {
      const weight = parseFloat(weights[item.id] || '0');
      if (weight > 0) {
        return sum + calculateItemPrice(item, weight);
      }
      return sum;
    }
    return sum + (item.final_price || item.price);
  }, 0);

  if (!order) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-950/30 dark:to-blue-950/30">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
              <Scale className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-foreground">Pesar Itens</h2>
              <p className="text-xs text-muted-foreground">{order.customer_name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
          >
            <X className="h-5 w-5 text-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
              <p className="text-sm text-muted-foreground mt-3">Carregando itens...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Itens que precisam ser pesados */}
              {itemsNeedingWeighing.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                    <h3 className="font-bold text-sm text-foreground">Itens Aguardando Pesagem</h3>
                  </div>
                  <div className="space-y-3">
                    {itemsNeedingWeighing.map(item => {
                      const weight = parseFloat(weights[item.id] || '0');
                      const estimatedPrice = weight > 0 ? calculateItemPrice(item, weight) : 0;

                      return (
                        <div key={item.id} className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <p className="font-bold text-foreground">{item.product_name}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {item.quantity} unidade{item.quantity > 1 ? 's' : ''} • R$ {(item.price_per_kg || item.price).toFixed(2)}/kg
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="flex-1">
                              <label className="text-xs font-bold text-muted-foreground mb-1 block">
                                Peso Real (kg)
                              </label>
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="0.000"
                                value={weights[item.id] || ''}
                                onChange={(e) => handleWeightChange(item.id, e.target.value)}
                                className="w-full h-10 px-3 border-2 border-amber-300 dark:border-amber-700 rounded-lg text-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-amber-500 bg-card text-foreground"
                              />
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-bold text-muted-foreground mb-1">Valor</p>
                              <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                                {estimatedPrice > 0 ? `R$ ${estimatedPrice.toFixed(2)}` : '—'}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Itens já pesados */}
              {itemsAlreadyWeighed.length > 0 && (
                <div>
                  <h3 className="font-bold text-sm text-muted-foreground mb-3">✅ Já Pesados</h3>
                  <div className="space-y-2">
                    {itemsAlreadyWeighed.map(item => (
                      <div key={item.id} className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 flex justify-between items-center">
                        <div>
                          <p className="font-semibold text-sm text-foreground">{item.product_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.quantity} un • {formatWeight(item.actual_weight_kg)}
                          </p>
                        </div>
                        <p className="font-bold text-emerald-600 dark:text-emerald-400">
                          R$ {(item.final_price || 0).toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Itens por peso (já têm valor) */}
              {itemsByWeight.length > 0 && (
                <div>
                  <h3 className="font-bold text-sm text-muted-foreground mb-3">⚖️ Vendidos por Peso</h3>
                  <div className="space-y-2">
                    {itemsByWeight.map(item => (
                      <div key={item.id} className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex justify-between items-center">
                        <div>
                          <p className="font-semibold text-sm text-foreground">{item.product_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatWeight(item.weight_kg)}
                          </p>
                        </div>
                        <p className="font-bold text-blue-600 dark:text-blue-400">
                          R$ {item.price.toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border bg-muted">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-muted-foreground">Total Estimado:</span>
            <span className="text-2xl font-extrabold text-primary">
              R$ {estimatedTotal.toFixed(2).replace(".", ",")}
            </span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 h-11 rounded-xl border-2 border-border text-foreground font-bold hover:bg-card transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="flex-1 h-11 rounded-xl bg-emerald-500 text-white font-bold hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Salvar Pesagem
                </>
              )}
            </button>
          </div>
          {!canSave && itemsNeedingWeighing.length > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 text-center mt-2">
              ⚠️ Preencha o peso de todos os itens para salvar
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
