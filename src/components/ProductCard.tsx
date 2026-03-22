import type { BasketProduct } from "@/hooks/useActiveBasket";

interface Props {
  product: BasketProduct;
}

export function ProductCard({ product }: Props) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-card p-3 shadow-sm border">
      <img
        src={product.image_url || "/placeholder.svg"}
        alt={product.name}
        className="h-16 w-16 rounded-lg object-cover"
        loading="lazy"
      />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-card-foreground">{product.name}</p>
        <p className="text-sm text-muted-foreground">{product.quantity}x</p>
      </div>
      <p className="font-bold text-primary">
        R$ {product.price.toFixed(2).replace(".", ",")}
      </p>
    </div>
  );
}
