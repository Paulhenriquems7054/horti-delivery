import { useState, useMemo } from "react";
import { useActiveBasket } from "@/hooks/useActiveBasket";
import { useCreateOrder } from "@/hooks/useCreateOrder";
import { ProductCard } from "@/components/ProductCard";
import { CheckoutForm } from "@/components/CheckoutForm";
import { ProductSearch } from "@/components/ProductSearch";
import { CategoryFilter } from "@/components/CategoryFilter";
import { WeightPickerModal } from "@/components/WeightPickerModal";
import { ShoppingCart, CheckCircle2, Leaf, Package, Store } from "lucide-react";
import { toast } from "sonner";
import { useParams } from "react-router-dom";
import { useStoreInfo } from "@/hooks/useStoreInfo";
import type { BasketProduct } from "@/hooks/useActiveBasket";

type Step = "basket" | "checkout" | "confirmation";

export default function Index() {
  const { slug } = useParams();
  const { data: store, isLoading: isStoreLoading, isError: isStoreError } = useStoreInfo(slug);
  
  // Agora os hooks carregam usando o store.id dessa loja!
  const { data: basket, isLoading: isBasketLoading, isError: isBasketError } = useActiveBasket(store?.id);
  const createOrder = useCreateOrder();
  
  const [step, setStep] = useState<Step>("basket");
  const [cart, setCart] = useState<Record<string, number>>({});        // unit: qty
  const [weightCart, setWeightCart] = useState<Record<string, number>>({}); // weight: kg
  const [weightModalProduct, setWeightModalProduct] = useState<BasketProduct | null>(null);
  const [confirmedTotal, setConfirmedTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const handleAdd = (id: string) => setCart(p => ({ ...p, [id]: (p[id] || 0) + 1 }));
  const handleRemove = (id: string) => {
    setCart(p => {
      const next = { ...p };
      if (next[id] > 1) next[id] -= 1;
      else delete next[id];
      return next;
    });
  };
  const handleWeightConfirm = (productId: string, weight: number) => {
    if (weight <= 0) {
      setWeightCart(p => { const n = { ...p }; delete n[productId]; return n; });
    } else {
      setWeightCart(p => ({ ...p, [productId]: weight }));
    }
  };

  // Calcula total considerando peso e unidade
  const cartTotal = useMemo(() => {
    if (!basket?.products) return 0;
    return basket.products.reduce((acc, p) => {
      if (p.sell_by === "weight") {
        const kg = weightCart[p.id] || 0;
        return acc + kg * (p.price_per_kg ?? p.price);
      }
      return acc + p.price * (cart[p.id] || 0);
    }, 0);
  }, [basket?.products, cart, weightCart]);

  const totalItems = Object.values(cart).reduce((a, b) => a + b, 0)
    + Object.keys(weightCart).length;

  // Filter products based on search and category
  const filteredProducts = useMemo(() => {
    if (!basket?.products) return [];
    
    let filtered = basket.products;
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query)
      );
    }
    
    // Apply category filter
    if (selectedCategory) {
      filtered = filtered.filter(p => p.category_id === selectedCategory);
    }
    
    return filtered;
  }, [basket?.products, searchQuery, selectedCategory]);

  /* ─── Loading Global ─── */
  if (isStoreLoading || isBasketLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4">
        <div className="flex flex-col items-center gap-3">
          <div className="relative h-16 w-16">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin-slow" />
          </div>
          <p className="text-muted-foreground font-semibold animate-pulse">
            Buscando cesta da semana...
          </p>
        </div>
      </div>
    );
  }

  /* ─── Loja Não Encontrada ─── */
  if (!store || isStoreError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
        <Store className="h-20 w-20 text-muted-foreground/30 mb-4" />
        <h1 className="text-2xl font-black text-foreground mb-2">Loja não encontrada</h1>
        <p className="text-muted-foreground mb-6 text-center">O link parece incorreto ou a loja foi desativada.</p>
        <button onClick={() => window.location.href = '/'} className="px-6 py-3 rounded-full gradient-hero text-white font-bold">Voltar ao Início</button>
      </div>
    );
  }

  /* ─── Erro de rede ou sem Cesta ─── */
  if (isBasketError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="text-center max-w-xs">
          <Package className="mx-auto h-14 w-14 text-muted-foreground/40 mb-4" />
          <h1 className="text-xl font-extrabold text-foreground">Ocorreu um erro</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Não conseguimos carregar as informações. Verifique sua conexão e tente novamente.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 h-11 px-6 rounded-xl gradient-hero text-white font-bold text-sm shadow-button"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  /* ─── Sem cesta ativa ─── */
  if (!basket) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
        <div className="text-center max-w-xs">
          <div className="mx-auto h-24 w-24 rounded-full gradient-card flex items-center justify-center mb-5">
            <span className="text-5xl">🥬</span>
          </div>
          <h1 className="text-2xl font-extrabold text-foreground">Sem cesta disponível</h1>
          <p className="text-muted-foreground mt-2 leading-relaxed">
            Nossa cesta da semana ainda não foi preparada. Volte em breve! 🌱
          </p>
        </div>
      </div>
    );
  }

  /* ─── Confirmação ─── */
  if (step === "confirmation") {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="gradient-hero px-4 py-5">
          <div className="mx-auto max-w-lg flex items-center gap-2">
            <Leaf className="h-7 w-7 text-white/90" />
            <span className="text-base font-extrabold text-white">horti-delivery-lite</span>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center px-4 py-8">
          <div className="text-center max-w-sm animate-pop-in">
            <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-14 w-14 text-emerald-500" />
            </div>
            <h1 className="text-3xl font-extrabold text-foreground">Pedido recebido!</h1>
            <p className="text-muted-foreground mt-2 text-lg leading-relaxed">
              Vamos preparar sua cesta com carinho 🥬✨
            </p>

            <div className="mt-6 rounded-2xl gradient-card border border-primary/20 p-5 text-left space-y-1">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                🛒 Seu pedido
              </p>
              <p className="text-lg font-extrabold text-foreground">Carrinho Personalizado</p>
              <p className="text-3xl font-extrabold text-primary">
                R$ {confirmedTotal.toFixed(2).replace(".", ",")}
              </p>
            </div>

            <p className="text-sm text-muted-foreground mt-4">
              Acompanhe o status com o atendente do mercado 📞
            </p>

            <button
              onClick={() => setStep("basket")}
              className="mt-6 w-full h-13 py-3.5 rounded-2xl border-2 border-primary text-primary font-extrabold text-base hover:bg-accent transition-colors"
            >
              ← Voltar ao início
            </button>
          </div>
        </main>
      </div>
    );
  }

  /* ─── Cesta + Checkout ─── */
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="gradient-hero px-4 py-5 shadow-md">
        <div className="mx-auto max-w-lg flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Leaf className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-white leading-tight">
              horti-delivery-lite
            </h1>
            <p className="text-xs text-white/75">Hortifruti fresquinho na sua porta 🌿</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg px-4 pb-10 flex-1">
        {/* Etapa 1: Carrinho/Cesta */}
        {step === "basket" && (
          <div className="animate-slide-up">
            {/* Hero da cesta */}
            <div className="mt-5 rounded-3xl gradient-card border border-primary/20 p-5 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="text-xs font-extrabold uppercase tracking-widest text-primary/70">
                    🥗 Produtos Disponíveis
                  </p>
                  <h2 className="text-2xl font-extrabold text-foreground mt-1">Monte sua Cesta</h2>
                  <p className="text-4xl font-extrabold text-primary mt-2">
                    R$ {cartTotal.toFixed(2).replace(".", ",")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {totalItems} item(s) selecionado(s) - {basket.products.length} no catálogo
                  </p>
                </div>
                <div className="text-5xl mt-1">🧺</div>
              </div>
            </div>

            {/* Lista de produtos */}
            <div className="mt-5 space-y-3">
              <h3 className="text-sm font-extrabold text-muted-foreground uppercase tracking-wider px-1">
                Catálogo da Semana
              </h3>
              
              {/* Search and Filter */}
              <div className="space-y-3">
                <ProductSearch onSearch={setSearchQuery} />
                <CategoryFilter 
                  storeId={store.id} 
                  selectedCategory={selectedCategory}
                  onSelectCategory={setSelectedCategory}
                />
              </div>

              {filteredProducts.length === 0 && (
                <div className="text-center py-12">
                  <Package className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">Nenhum produto encontrado</p>
                </div>
              )}

              {filteredProducts.map((p, i) => (
                <div key={p.id} className="animate-slide-up" style={{ animationDelay: `${i * 60}ms`, opacity: 0 }}>
                  <ProductCard
                    product={p}
                    cartQty={cart[p.id] || 0}
                    cartWeight={weightCart[p.id]}
                    onAdd={() => handleAdd(p.id)}
                    onRemove={() => handleRemove(p.id)}
                    onSelectWeight={() => setWeightModalProduct(p)}
                  />
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="mt-7 space-y-3">
              <button
                id="btn-comprar-agora"
                disabled={totalItems === 0}
                onClick={() => setStep("checkout")}
                className="w-full h-14 rounded-2xl bg-primary text-white text-lg font-extrabold shadow-button flex items-center justify-center gap-2 transition-transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
              >
                <ShoppingCart className="h-5 w-5" />
                Ir p/ Checkout ({totalItems})
              </button>
              <p className="text-center text-xs text-muted-foreground">
                🔒 Sem cartão • Pagamento na entrega
              </p>
            </div>
          </div>
        )}

        {/* Etapa 2: Checkout */}
        {step === "checkout" && (
          <div className="mt-6">
            <CheckoutForm
              loading={createOrder.isPending}
              basketName={basket.name}
              basketPrice={cartTotal}
              storeId={store.id}
              onBack={() => setStep("basket")}
              onSubmit={(data) => {
                const selectedProducts = basket.products
                  .filter(p => p.sell_by === "weight" ? (weightCart[p.id] || 0) > 0 : (cart[p.id] || 0) > 0)
                  .map(p => p.sell_by === "weight"
                    ? { ...p, quantity: 1, weight_kg: weightCart[p.id], price: (p.price_per_kg ?? p.price) * weightCart[p.id] }
                    : { ...p, quantity: cart[p.id] }
                  );

                createOrder.mutate(
                  {
                    ...data,
                    total: data.total_with_fee || cartTotal,
                    products: selectedProducts,
                    storeId: store.id,
                    delivery_zone_id: data.neighborhood_id,
                    coupon_id: data.coupon_id,
                    delivery_fee: data.delivery_fee,
                    discount: data.discount,
                  },
                  {
                    onSuccess: () => {
                      toast.success("Pedido enviado com sucesso! 🎉");
                      setConfirmedTotal(data.total_with_fee || cartTotal);
                      setCart({});
                      setWeightCart({});
                      setStep("confirmation");
                    },
                    onError: (err: any) => {
                      console.error(err);
                      toast.error("Erro ao enviar pedido. Verifique sua conexão.");
                    },
                  }
                );
              }}
            />
          </div>
        )}
      </main>

      {/* Modal de seleção de peso */}
      <WeightPickerModal
        product={weightModalProduct}
        onClose={() => setWeightModalProduct(null)}
        onConfirm={handleWeightConfirm}
      />

      {/* Footer com link para Administração */}
      <footer className="py-6 text-center border-t mt-auto">
        <p className="text-[10px] text-slate-400 font-medium">© {new Date().getFullYear()} {store?.name || "HortiDelivery"} • Pedidos Seguros</p>
      </footer>

    </div>
  );
}
