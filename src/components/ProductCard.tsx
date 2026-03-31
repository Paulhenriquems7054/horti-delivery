import { Scale } from "lucide-react";
import type { BasketProduct } from "@/hooks/useActiveBasket";

const EMOJI_MAP: Record<string, string> = {
  banana: "🍌", tomate: "🍅", alface: "🥬", batata: "🥔",
  cebola: "🧅", "maçã": "🍎", maca: "🍎", laranja: "🍊",
  uva: "🍇", abacaxi: "🍍", cenoura: "🥕", "limão": "🍋",
  limao: "🍋", "melão": "🍈", melao: "🍈", morango: "🍓",
  manga: "🥭", abacate: "🥑", pimentão: "🫑", pepino: "🥒",
  couve: "🥬", alho: "🧄",
};

function getEmoji(name: string): string {
  const lower = name.toLowerCase();
  for (const key of Object.keys(EMOJI_MAP)) {
    if (lower.includes(key)) return EMOJI_MAP[key];
  }
  return "🥦";
}

interface Props {
  product: BasketProduct;
  cartQty?: number;         // unidades (unit) ou número de entradas (weight)
  cartWeight?: number;      // kg total no carrinho (weight mode)
  onAdd?: () => void;       // unit mode
  onRemove?: () => void;    // unit mode
  onSelectWeight?: () => void; // weight mode — abre modal
}

export function ProductCard({ product, cartQty = 0, cartWeight, onAdd, onRemove, onSelectWeight }: Props) {
  const emoji = getEmoji(product.name);
  const isWeight = product.sell_by === "weight";
  const pricePerKg = product.price_per_kg ?? product.price;
  const inCart = isWeight ? (cartWeight ?? 0) > 0 : cartQty > 0;

  return (
    <div className={`flex items-center gap-3 rounded-2xl bg-white p-3 shadow-card border transition-all ${inCart ? "border-primary/40 bg-emerald-50/30" : "border-border/60"}`}>
      {/* Imagem / Emoji */}
      <div className="flex-shrink-0 h-14 w-14 rounded-xl gradient-card flex items-center justify-center overflow-hidden">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="text-2xl" role="img" aria-label={product.name}>{emoji}</span>
        )}
      </div>

      {/* Infos */}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-foreground truncate">{product.name}</p>
        {isWeight ? (
          <div>
            <p className="text-sm mt-0.5">
              <span className="text-primary font-bold">R$ {pricePerKg.toFixed(2).replace(".", ",")}</span>
              <span className="text-xs text-muted-foreground ml-1">/ kg</span>
            </p>
            {inCart && cartWeight && (
              <p className="text-xs text-emerald-600 font-semibold mt-0.5">
                {cartWeight < 1 ? `${Math.round(cartWeight * 1000)}g` : `${cartWeight.toFixed(2)}kg`}
                {" "}≈ R$ {(cartWeight * pricePerKg).toFixed(2).replace(".", ",")}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mt-0.5">
            <span className="text-primary font-bold">R$ {product.price.toFixed(2).replace(".", ",")}</span>
            <span className="text-xs text-muted-foreground ml-1">/ {product.unit === "kg" ? "kg" : "un"}</span>
          </p>
        )}
      </div>

      {/* Controles */}
      <div className="flex-shrink-0">
        {isWeight ? (
          /* Modo peso — sempre mostra botão que abre modal */
          <button
            onClick={onSelectWeight}
            className={`h-9 px-3 rounded-full text-sm font-extrabold flex items-center gap-1.5 transition-colors ${
              inCart
                ? "bg-primary text-white hover:bg-primary/90"
                : "bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100"
            }`}
          >
            <Scale className="h-3.5 w-3.5" />
            {inCart ? "Alterar" : "Selecionar"}
          </button>
        ) : (
          /* Modo unitário */
          cartQty > 0 ? (
            <div className="flex items-center gap-3 bg-accent rounded-full p-1 border border-primary/20">
              <button onClick={onRemove} className="h-7 w-7 rounded-full bg-white text-primary font-bold flex items-center justify-center shadow-sm hover:bg-slate-50">-</button>
              <span className="text-sm font-extrabold text-primary w-3 text-center">{cartQty}</span>
              <button onClick={onAdd} className="h-7 w-7 rounded-full bg-primary text-white font-bold flex items-center justify-center shadow-sm hover:bg-primary/90">+</button>
            </div>
          ) : (
            <button onClick={onAdd} className="h-9 px-4 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 text-sm font-extrabold hover:bg-emerald-100 transition-colors">
              Adicionar
            </button>
          )
        )}
      </div>
    </div>
  );
}
