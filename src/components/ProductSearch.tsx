import { useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Props {
  onSearch: (query: string) => void;
  placeholder?: string;
}

export function ProductSearch({ onSearch, placeholder = "Buscar produtos..." }: Props) {
  const [query, setQuery] = useState("");

  const handleChange = (value: string) => {
    setQuery(value);
    onSearch(value);
  };

  const handleClear = () => {
    setQuery("");
    onSearch("");
  };

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
      <Input
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        className="pl-10 pr-10 h-12 rounded-xl"
      />
      {query && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-muted hover:bg-muted-foreground/20 flex items-center justify-center transition-colors"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
