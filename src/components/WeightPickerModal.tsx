import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Minus, Plus, Scale } from "lucide-react";
import type { BasketProduct } from "@/hooks/useActiveBasket";
import { getEffectivePricePerKg } from "@/utils/productPricing";

interface Props {
  product: BasketProduct | null;
  onClose: () => void;
  onConfirm: (productId: string, weight: number) => void;
}

const QUICK_WEIGHTS = [0.25, 0.5, 0.75, 1, 1.5, 2];

export function WeightPickerModal({ product, onClose, onConfirm }: Props) {
  const [weight, setWeight] = useState(product?.min_weight ?? 0.25);
  const [customWeight, setCustomWeight] = useState("");
  const step = product?.step_weight ?? 0.25;
  const pricePerKg = product ? getEffectivePricePerKg(product) : 0;
  const total = weight * pricePerKg;
  const formatWeight = (valueKg: number) =>
    valueKg < 1
      ? `${Math.round(valueKg * 1000)}g`
      : `${valueKg.toFixed(2).replace(".", ",")}kg`;

  useEffect(() => {
    if (!product) return;
    setWeight(product.min_weight ?? 0.25);
    setCustomWeight("");
  }, [product]);

  if (!product) return null;

  const handleStep = (dir: 1 | -1) => {
    setWeight(prev => {
      const next = Math.round((prev + dir * step) * 100) / 100;
      return Math.max(step, next);
    });
  };

  const handleCustomWeightChange = (value: string) => {
    setCustomWeight(value);
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed) && parsed >= step) {
      setWeight(Math.round(parsed * 100) / 100);
    }
  };

  return (
    <Dialog open={!!product} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            {product.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Preço por kg */}
          <p className="text-sm text-muted-foreground text-center">
            R$ {pricePerKg.toFixed(2).replace(".", ",")} / kg
          </p>

          {/* Stepper de peso */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => handleStep(-1)}
              disabled={weight <= step}
              className="h-12 w-12 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center disabled:opacity-30 transition-colors"
            >
              <Minus className="h-5 w-5" />
            </button>

            <div className="text-center min-w-[100px]">
              <p className="text-4xl font-extrabold text-foreground">
                {formatWeight(weight)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">peso estimado</p>
            </div>

            <button
              onClick={() => handleStep(1)}
              className="h-12 w-12 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>

          {/* Atalhos rápidos */}
          <div className="flex flex-wrap gap-2 justify-center">
            {QUICK_WEIGHTS.filter(w => w >= step).map(w => (
              <button
                key={w}
                onClick={() => setWeight(w)}
                className={`px-3 py-1.5 rounded-full text-sm font-bold border transition-colors ${
                  weight === w
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-slate-600 border-slate-200 hover:border-primary hover:text-primary"
                }`}
              >
                {formatWeight(w)}
              </button>
            ))}
          </div>

          {/* Peso livre em kg */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted-foreground">
              Outro peso (kg) - para pedidos acima de 2kg
            </label>
            <input
              type="number"
              min={step}
              step={step}
              placeholder="Ex: 5"
              value={customWeight}
              onChange={(e) => handleCustomWeightChange(e.target.value)}
              className="w-full h-11 rounded-xl border border-border px-3 text-sm font-semibold bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Total estimado */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
            <p className="text-xs text-emerald-600 font-semibold mb-1">Total estimado</p>
            <p className="text-3xl font-extrabold text-emerald-700">
              R$ {total.toFixed(2).replace(".", ",")}
            </p>
            <p className="text-xs text-emerald-500 mt-1">
              ⚠️ Valor pode variar conforme peso real na balança
            </p>
          </div>

          {/* Botão confirmar */}
          <button
            onClick={() => { onConfirm(product.id, weight); onClose(); }}
            className="w-full h-13 py-3.5 rounded-2xl gradient-hero text-white font-extrabold text-base shadow-button active:scale-[0.98] transition-transform"
          >
            Adicionar ao Carrinho
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
