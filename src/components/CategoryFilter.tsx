import { useCategories } from "@/hooks/useCategories";
import { Button } from "@/components/ui/button";

interface Props {
  storeId?: string;
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string | null) => void;
}

export function CategoryFilter({ storeId, selectedCategory, onSelectCategory }: Props) {
  const { data: categories } = useCategories(storeId);

  if (!categories || categories.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
      <Button
        variant={selectedCategory === null ? "default" : "outline"}
        size="sm"
        onClick={() => onSelectCategory(null)}
        className="shrink-0"
      >
        Todos
      </Button>
      {categories.map((cat) => (
        <Button
          key={cat.id}
          variant={selectedCategory === cat.id ? "default" : "outline"}
          size="sm"
          onClick={() => onSelectCategory(cat.id)}
          className="shrink-0"
        >
          {cat.icon && <span className="mr-1">{cat.icon}</span>}
          {cat.name}
        </Button>
      ))}
    </div>
  );
}
