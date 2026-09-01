import { useCategories } from "@/hooks/useCategories";
import { CATALOG_CATEGORY_SEEDS } from "@/lib/productCategory/classifyProduct";

interface Props {
  storeId?: string;
  selectedCategories: string[];
  onToggleCategory: (categoryId: string) => void;
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
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => {
          const selected = selectedCategories.includes(cat.id);
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
            </button>
          );
        })}
      </div>
    </div>
  );
}
