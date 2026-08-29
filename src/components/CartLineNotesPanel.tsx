import { Trash2, MessageSquare } from "lucide-react";
import type { ResolvedCartLine } from "@/types/cart";
import { formatCurrency } from "@/utils/priceEstimation";

interface Props {
  lines: ResolvedCartLine[];
  onUpdateNotes: (lineId: string, notes: string) => void;
  onRemoveLine: (lineId: string) => void;
}

export function CartLineNotesPanel({ lines, onUpdateNotes, onRemoveLine }: Props) {
  if (lines.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-primary/10 space-y-3">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
        Itens do carrinho
      </p>
      {lines.map((line) => {
        const detail =
          line.soldBy === "weight"
            ? line.weightKg < 1
              ? `${Math.round(line.weightKg * 1000)}g`
              : `${line.weightKg.toFixed(2)} kg`
            : `${line.quantity} un`;

        return (
          <div
            key={line.lineId}
            className="rounded-xl border border-border bg-card p-3 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-foreground text-sm">{line.product.name}</p>
                <p className="text-xs text-muted-foreground">
                  {detail} · {formatCurrency(line.lineSubtotal)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemoveLine(line.lineId)}
                className="h-8 w-8 rounded-lg hover:bg-red-50 text-red-600 flex items-center justify-center shrink-0"
                aria-label="Remover item"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <label className="block">
              <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1 mb-1">
                <MessageSquare className="h-3 w-3" />
                Observação (opcional)
              </span>
              <input
                type="text"
                value={line.itemNotes}
                onChange={(e) => onUpdateNotes(line.lineId, e.target.value)}
                placeholder="Ex: Banana madura"
                maxLength={500}
                className="w-full h-10 rounded-lg border border-border px-3 text-sm bg-background"
              />
            </label>
          </div>
        );
      })}
    </div>
  );
}
