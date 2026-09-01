import { Scale, Info } from "lucide-react";
import type { BasketProduct } from "@/hooks/useActiveBasket";
import { calculateUnitPriceEstimate, formatCurrency, formatPriceRange } from "@/utils/priceEstimation";
import { isProductInStock } from "@/hooks/useToggleProductInStock";

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
  selectedMode?: 'unit' | 'weight'; // modo selecionado quando sell_by = 'both'
  onToggleMode?: () => void; // alterna entre unit e weight
}

export function ProductCard({ 
  product, 
  cartQty = 0, 
  cartWeight, 
  onAdd, 
  onRemove, 
  onSelectWeight,
  selectedMode,
  onToggleMode 
}: Props) {
  const emoji = getEmoji(product.name);
  const sellBy = (product.sell_by || 'unit') as 'unit' | 'weight' | 'both';
  const isBoth = sellBy === 'both';
  const currentMode: 'unit' | 'weight' = isBoth ? (selectedMode || 'unit') : (sellBy === 'weight' ? 'weight' : 'unit');
  const isWeight = currentMode === 'weight';
  const isAvailable = isProductInStock(product.in_stock);
  
  const pricePerKg = product.price_per_kg ?? product.price;
  const pricePerUnit = (product as any).price_per_unit ?? product.price;
  const inCart = isWeight ? (cartWeight ?? 0) > 0 : cartQty > 0;
  
  const unitEstimate = !isWeight ? calculateUnitPriceEstimate(product, cartQty || 1) : null;

  return (
    <div className={`flex items-start gap-3 rounded-2xl bg-card p-3 shadow-card border transition-all ${inCart ? "border-primary/40 bg-emerald-50/30 dark:bg-emerald-950/20" : "border-border/60"} ${!isAvailable ? "opacity-60" : ""}`}>
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
        <div className="flex items-start gap-2 flex-wrap">
          <p className="font-bold text-foreground break-words leading-snug min-w-0 flex-1">{product.name}</p>
          {!isAvailable && (
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-red-100 text-red-700">
              Indisponível
            </span>
          )}
        </div>
        
        {/* Preço por kg - SEMPRE visível */}
        <p className="text-sm mt-0.5">
          <span className="text-primary font-bold">{formatCurrency(pricePerKg)}</span>
          <span className="text-xs text-muted-foreground ml-1">/ kg</span>
        </p>
        
        {/* Estimativa para produtos por unidade (quando não está no modo peso) */}
        {!isWeight && unitEstimate && (
          <div className="mt-0.5">
            {unitEstimate.hasEstimate ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                <Scale className="h-3 w-3" />
                Estimativa: {formatPriceRange(unitEstimate.min, unitEstimate.max)}
                {product.average_weight && (
                  <span className="text-muted-foreground font-normal">
                    (~{product.average_weight < 1 ? `${Math.round(product.average_weight * 1000)}g` : `${product.average_weight}kg`}/un)
                  </span>
                )}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" />
                Valor após pesagem
              </p>
            )}
          </div>
        )}
        
        {/* Toggle de modo (quando sell_by = 'both') */}
        {isBoth && onToggleMode && (
          <div className="flex gap-1 mt-1">
            <button
              onClick={onToggleMode}
              disabled={!isAvailable}
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold transition-colors ${
                currentMode === 'unit' 
                  ? 'bg-primary text-white' 
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Por Unidade
            </button>
            <button
              onClick={onToggleMode}
              disabled={!isAvailable}
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold transition-colors ${
                currentMode === 'weight' 
                  ? 'bg-primary text-white' 
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Por Peso
            </button>
          </div>
        )}
        
        {/* Informação do carrinho - modo peso */}
        {isWeight && inCart && cartWeight && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
            {cartWeight < 1 ? `${Math.round(cartWeight * 1000)}g` : `${cartWeight.toFixed(2)}kg`}
            {" "}≈ {formatCurrency(cartWeight * pricePerKg)}
          </p>
        )}
        
        {/* Informação do carrinho - modo unidade com estimativa */}
        {!isWeight && inCart && cartQty > 0 && unitEstimate?.hasEstimate && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
            {cartQty} un ≈ {formatCurrency(unitEstimate.estimated)}
          </p>
        )}
      </div>

      {/* Controles */}
      <div className="flex-shrink-0 pt-0.5">
        {isWeight ? (
          /* Modo peso — sempre mostra botão que abre modal */
          <button
            onClick={onSelectWeight}
            disabled={!isAvailable}
            className={`h-9 px-3 rounded-full text-sm font-extrabold flex items-center gap-1.5 transition-colors ${
              inCart
                ? "bg-primary text-white hover:bg-primary/90"
                : "bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100"
            }`}
          >
            <Scale className="h-3.5 w-3.5" />
            {!isAvailable ? "Indisponível" : inCart ? "Alterar" : "Selecionar"}
          </button>
        ) : (
          /* Modo unitário */
          cartQty > 0 ? (
            <div className="flex items-center gap-3 bg-accent rounded-full p-1 border border-primary/20">
              <button onClick={onRemove} disabled={!isAvailable} className="h-7 w-7 rounded-full bg-card text-primary font-bold flex items-center justify-center shadow-sm hover:bg-muted">-</button>
              <span className="text-sm font-extrabold text-primary w-3 text-center">{cartQty}</span>
              <button onClick={onAdd} disabled={!isAvailable} className="h-7 w-7 rounded-full bg-primary text-white font-bold flex items-center justify-center shadow-sm hover:bg-primary/90">+</button>
            </div>
          ) : (
            <button onClick={onAdd} disabled={!isAvailable} className="h-9 px-4 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-sm font-extrabold hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors">
              {isAvailable ? "Adicionar" : "Indisponível"}
            </button>
          )
        )}
      </div>
    </div>
  );
}
