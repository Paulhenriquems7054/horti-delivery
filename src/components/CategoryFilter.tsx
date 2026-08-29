import { useCategories } from "@/hooks/useCategories";
import { CATALOG_CATEGORY_SEEDS } from "@/lib/productCategory/classifyProduct";

interface Props {
  storeId?: string;
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  /** Quando true, exige escolher uma categoria antes de listar produtos */
  requireSelection?: boolean;
}

function shortLabelFor(name: string): string {
  const seed = CATALOG_CATEGORY_SEEDS.find((s) => s.name === name);
  return seed?.shortLabel ?? name;
}

export function CategoryFilter({
  storeId,
  selectedCategory,
  onSelectCategory,
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
        Escolha uma categoria
      </p>
      <div className="flex flex-wrap gap-2">
        {!requireSelection && (
          <button
            type="button"
            onClick={() => onSelectCategory(null)}
            className={`h-10 px-3 rounded-xl text-sm font-bold border shrink-0 transition-colors ${
              selectedCategory === null
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border hover:bg-muted"
            }`}
          >
            Todos
          </button>
        )}
        {categories.map((cat) => {
          const selected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(cat.id)}
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
