import { useState } from "react";
import { Scale, Info, HelpCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  productId: string;
  productName: string;
  pricePerKg: number;
  currentAverageWeight?: number | null;
  currentWeightVariance?: number | null;
  onClose?: () => void;
}

export function ProductWeightSettings({
  productId,
  productName,
  pricePerKg,
  currentAverageWeight,
  currentWeightVariance,
  onClose,
}: Props) {
  const queryClient = useQueryClient();
  const [averageWeight, setAverageWeight] = useState(
    currentAverageWeight?.toString() || ""
  );
  const [weightVariance, setWeightVariance] = useState(
    ((currentWeightVariance || 0.15) * 100).toString()
  );

  const avgWeightNum = parseFloat(averageWeight) || 0;
  const varianceNum = (parseFloat(weightVariance) || 15) / 100;

  const estimatedPrice = avgWeightNum * pricePerKg;
  const minPrice = avgWeightNum * (1 - varianceNum) * pricePerKg;
  const maxPrice = avgWeightNum * (1 + varianceNum) * pricePerKg;

  const formatWeight = (weightKg: number) => {
    if (weightKg < 1) return `${Math.round(weightKg * 1000)}g`;
    return `${weightKg.toFixed(2).replace(".", ",")}kg`;
  };

  const updateWeightMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("products")
        .update({
          average_weight: avgWeightNum > 0 ? avgWeightNum : null,
          weight_variance: varianceNum,
        })
        .eq("id", productId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações de peso salvas!");
      queryClient.invalidateQueries({ queryKey: ["admin-active-basket"] });
      queryClient.invalidateQueries({ queryKey: ["active-basket"] });
      queryClient.invalidateQueries({ queryKey: ["admin-store-products"] });
      onClose?.();
    },
    onError: (err: any) => {
      toast.error("Erro ao salvar: " + err.message);
    },
  });

  return (
    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 space-y-4">
      <div className="flex items-start gap-2">
        <Scale className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
        <div>
          <h3 className="font-bold text-foreground text-sm">
            Configurar Peso Médio
          </h3>
          <p className="text-xs text-muted-foreground">
            {productName} • R$ {pricePerKg.toFixed(2)}/kg
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
            Peso Médio (kg)
            <HelpCircle className="h-3 w-3" title="Peso aproximado de uma unidade" />
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="Ex: 1.2"
            value={averageWeight}
            onChange={(e) => setAverageWeight(e.target.value)}
            className="w-full mt-1 h-10 px-3 border border-border rounded-lg text-sm bg-card text-foreground focus:ring-2 focus:ring-primary/50 focus:outline-none"
          />
          {avgWeightNum > 0 && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
              = {formatWeight(avgWeightNum)} por unidade
            </p>
          )}
        </div>

        <div>
          <label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
            Variação (%)
            <HelpCircle className="h-3 w-3" title="Margem de variação do peso" />
          </label>
          <input
            type="number"
            step="1"
            min="0"
            max="50"
            placeholder="Ex: 15"
            value={weightVariance}
            onChange={(e) => setWeightVariance(e.target.value)}
            className="w-full mt-1 h-10 px-3 border border-border rounded-lg text-sm bg-card text-foreground focus:ring-2 focus:ring-primary/50 focus:outline-none"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Padrão: 15%
          </p>
        </div>
      </div>

      {avgWeightNum > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
          <p className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-1">
            <Info className="h-3 w-3" /> Prévia da Estimativa
          </p>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Preço estimado:</span>
              <span className="font-bold text-primary">
                R$ {estimatedPrice.toFixed(2).replace(".", ",")}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Faixa de preço:</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                R$ {minPrice.toFixed(2).replace(".", ",")} – R$ {maxPrice.toFixed(2).replace(".", ",")}
              </span>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            O cliente verá esta estimativa ao adicionar o produto por unidade
          </p>
        </div>
      )}

      {!avgWeightNum && (
        <div className="bg-muted/50 rounded-lg p-3 border border-border">
          <p className="text-xs text-muted-foreground text-center">
            Sem peso médio definido, o cliente verá "Valor após pesagem"
          </p>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-10 rounded-lg border border-border text-sm font-bold text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={() => updateWeightMutation.mutate()}
          disabled={updateWeightMutation.isPending}
          className="flex-1 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
        >
          {updateWeightMutation.isPending ? (
            <span className="animate-pulse">Salvando...</span>
          ) : (
            <>
              <Scale className="h-4 w-4" />
              Salvar Peso
            </>
          )}
        </button>
      </div>
    </div>
  );
}
