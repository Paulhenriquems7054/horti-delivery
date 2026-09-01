import { useCategories } from "@/hooks/useCategories";
import { CATALOG_CATEGORY_SEEDS } from "@/lib/productCategory/classifyProduct";

interface Props {
  storeId?: string;
  selectedCategories: string[];
  onToggleCategory: (categoryId: string) => void;
  /** Quantidade de itens na cesta por category_id */
  cartCountByCategory?: Map<string, number>;
  /** Quando true, exige ao menos uma categoria antes de listar produtos */
  requireSelection?: boolean;
}

function shortLabelFor(name: string): string {
  const seed = CATALOG_CATEGORY_SEEDS.find((s) => s.name === name);
  return seed?.shortLabel ?? name;
}

export function CategoryFilter({
  storeId,
  selectedCategories,
  onToggleCategory,
  cartCountByCategory,
  requireSelection = false,
}: Props) {
  const { data: categories } = useCategories(storeId);

  if (!categories || categories.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Categorias ainda não configuradas para esta loja.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {requireSelection ? "Escolha uma ou mais categorias" : "Categorias"}
      </p>
      <p className="text-[11px] text-muted-foreground leading-snug">
        Toque para marcar ou desmarcar. Você pode adicionar itens de várias categorias na mesma cesta.
      </p>
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => {
          const selected = selectedCategories.includes(cat.id);
          const cartCount = cartCountByCategory?.get(cat.id) ?? 0;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onToggleCategory(cat.id)}
              aria-pressed={selected}
              className={`h-10 px-3 rounded-xl text-sm font-bold border shrink-0 transition-colors inline-flex items-center gap-1.5 ${
                selected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border hover:bg-muted"
              }`}
            >
              {cat.icon ? <span aria-hidden>{cat.icon}</span> : null}
              <span>{shortLabelFor(cat.name)}</span>
              {cartCount > 0 ? (
                <span
                  className={`min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-extrabold inline-flex items-center justify-center ${
                    selected ? "bg-white/25 text-white" : "bg-primary/15 text-primary"
                  }`}
                  title={`${cartCount} item(ns) na cesta`}
                >
                  {cartCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
