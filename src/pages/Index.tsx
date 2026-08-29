import { useState, useMemo, useCallback } from "react";
import { useActiveBasket } from "@/hooks/useActiveBasket";
import { useCreateOrder } from "@/hooks/useCreateOrder";
import { ProductCard } from "@/components/ProductCard";
import { CheckoutForm } from "@/components/CheckoutForm";
import { ProductSearch } from "@/components/ProductSearch";
import { CategoryFilter } from "@/components/CategoryFilter";
import { WeightPickerModal } from "@/components/WeightPickerModal";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CartEstimateWarning } from "@/components/CartEstimateWarning";
import { ShoppingCart, CheckCircle2, Leaf, Package, Store, ClipboardList, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useParams, useNavigate } from "react-router-dom";
import { useStoreInfo } from "@/hooks/useStoreInfo";
import type { BasketProduct } from "@/hooks/useActiveBasket";
import { calculateCartLinesEstimate, formatCurrency } from "@/utils/priceEstimation";
import { isStorePubliclyBlocked } from "@/lib/storeAccess";
import { StoreUnavailable } from "@/components/StoreUnavailable";
import { paymentLabel, toStoredPaymentMethod } from "@/lib/paymentMethods";
import { saveLastOrderPhone, saveTrackingPhone } from "@/lib/customerSession";
import { CartLineNotesPanel } from "@/components/CartLineNotesPanel";
import { StoreLogo } from "@/components/StoreLogo";
import { useStoreOperationalSettings } from "@/hooks/useStoreOperationalSettings";
import { isWithinDeliveryHours } from "@/lib/storeHours";
import type { CartLineItem } from "@/types/cart";
import { newCartLine, resolveCartLines } from "@/types/cart";
import { useCategories } from "@/hooks/useCategories";
import { useCategoryProductCounts } from "@/hooks/useCategoryProductCounts";
import {
  flattenCatalogPages,
  useStoreCatalogProducts,
} from "@/hooks/useStoreCatalogProducts";
import { useProductsByIds } from "@/hooks/useProductsByIds";

type Step = "basket" | "checkout" | "confirmation";

export default function Index() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("basket");
  const [cartLines, setCartLines] = useState<CartLineItem[]>([]);
  const [productMode, setProductMode] = useState<Record<string, 'unit' | 'weight'>>({});
  const [weightModalProduct, setWeightModalProduct] = useState<BasketProduct | null>(null);
  const [confirmedTotal, setConfirmedTotal] = useState(0);
  const [confirmedItems, setConfirmedItems] = useState<any[]>([]);
  const [confirmedOrderId, setConfirmedOrderId] = useState<string>("");
  const [confirmedPhone, setConfirmedPhone] = useState<string>("");
  const [confirmedPayment, setConfirmedPayment] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const { data: store, isLoading: isStoreLoading, isError: isStoreError } = useStoreInfo(slug);
  const blocked = isStorePubliclyBlocked(store);
  const { data: basket, isLoading: isBasketLoading, isError: isBasketError } = useActiveBasket(
    blocked ? undefined : store?.id,
    { loadProducts: false },
  );
  const { data: categories } = useCategories(blocked ? undefined : store?.id);
  const categoryIds = useMemo(() => (categories ?? []).map((c) => c.id), [categories]);
  const { data: categoryCounts } = useCategoryProductCounts(store?.id, categoryIds);

  const {
    data: catalogPages,
    isLoading: isCatalogLoading,
    isError: isCatalogError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchCatalog,
  } = useStoreCatalogProducts(store?.id, selectedCategory, searchQuery);

  const catalogProducts = useMemo(
    () => flattenCatalogPages(catalogPages?.pages),
    [catalogPages?.pages],
  );

  const cartProductIds = useMemo(
    () => [...new Set(cartLines.map((l) => l.productId))],
    [cartLines],
  );
  const { data: cartProducts = [] } = useProductsByIds(store?.id, cartProductIds);

  const handleSelectCategory = useCallback((categoryId: string | null) => {
    setSelectedCategory(categoryId);
    setSearchQuery("");
  }, []);
  const createOrder = useCreateOrder();
  const { data: operationalSettings } = useStoreOperationalSettings(slug);

  const getProductMode = (product: BasketProduct): 'unit' | 'weight' => {
    const sellBy = product.sell_by || 'unit';
    return sellBy === 'both' ? (productMode[product.id] || 'unit') : sellBy;
  };

  const handleAdd = (product: BasketProduct) => {
    const mode = getProductMode(product);
    if (mode === 'weight') {
      setWeightModalProduct(product);
      return;
    }
    setCartLines((prev) => [...prev, newCartLine(product.id, 'unit')]);
  };

  const handleRemove = (product: BasketProduct) => {
    const mode = getProductMode(product);
    setCartLines((prev) => {
      const idx = [...prev].reverse().findIndex(
        (l) => l.productId === product.id && l.soldBy === mode
      );
      if (idx < 0) return prev;
      const realIdx = prev.length - 1 - idx;
      const line = prev[realIdx];
      if (line.soldBy === 'unit' && line.quantity > 1) {
        return prev.map((l, i) =>
          i === realIdx ? { ...l, quantity: l.quantity - 1 } : l
        );
      }
      return prev.filter((_, i) => i !== realIdx);
    });
  };

  const handleWeightConfirm = (productId: string, weight: number) => {
    if (weight <= 0) return;
    setCartLines((prev) => [
      ...prev,
      newCartLine(productId, 'weight', { weightKg: weight }),
    ]);
    setWeightModalProduct(null);
  };
  
  const handleToggleMode = (productId: string) => {
    setProductMode(prev => ({
      ...prev,
      [productId]: prev[productId] === 'weight' ? 'unit' : 'weight'
    }));
    setCartLines((prev) => prev.filter((l) => l.productId !== productId));
  };

  const updateLineNotes = (lineId: string, notes: string) => {
    setCartLines((prev) =>
      prev.map((l) => (l.lineId === lineId ? { ...l, itemNotes: notes } : l))
    );
  };

  const removeCartLine = (lineId: string) => {
    setCartLines((prev) => prev.filter((l) => l.lineId !== lineId));
  };

  const resolvedCartLines = useMemo(
    () => resolveCartLines(cartLines, cartProducts),
    [cartLines, cartProducts]
  );

  const cartEstimates = useMemo(
    () => calculateCartLinesEstimate(resolvedCartLines),
    [resolvedCartLines]
  );

  const cartTotal = cartEstimates.itemsSubtotal;

  const cartLinesSummary = useMemo(
    () =>
      resolvedCartLines.map((line) => ({
        name: line.product.name,
        detail:
          line.soldBy === 'weight'
            ? line.weightKg < 1
              ? `${Math.round(line.weightKg * 1000)}g`
              : `${line.weightKg}kg`
            : `${line.quantity} un`,
        subtotal: line.lineSubtotal,
        itemNotes: line.itemNotes,
      })),
    [resolvedCartLines]
  );

  const totalItems = resolvedCartLines.length;
  const itemsByWeight = resolvedCartLines.filter((l) => l.soldBy === 'weight').length;
  const itemsByUnit = resolvedCartLines
    .filter((l) => l.soldBy === 'unit')
    .reduce((sum, l) => sum + l.quantity, 0);

  const itemsNeedingWeighing = useMemo(
    () => resolvedCartLines.filter((l) => l.soldBy === 'unit'),
    [resolvedCartLines]
  );

  const outsideDeliveryHours = operationalSettings
    ? !isWithinDeliveryHours(operationalSettings)
    : false;

  const selectedCategoryCount =
    selectedCategory && categoryCounts
      ? categoryCounts.byCategoryId.get(selectedCategory) ?? 0
      : 0;

  const selectedCategoryHasNoProducts =
    !!selectedCategory && !isCatalogLoading && selectedCategoryCount === 0;

  const catalogTotalInCategory = catalogPages?.pages[0]?.totalCount ?? selectedCategoryCount;

  if (isStoreLoading) {
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

  if (blocked) {
    return <StoreUnavailable storeName={store.name} />;
  }

  if (isBasketLoading) {
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
            <div className="h-12 w-12 rounded-lg bg-white/20 flex items-center justify-center overflow-hidden p-1">
              <StoreLogo
                logoPath={store.logo_path}
                logoVersion={store.updated_at}
                alt={store.name}
                className="h-full w-full"
              />
            </div>
            <span className="text-base font-extrabold text-white">{store.name}</span>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center px-4 py-8">
          <div className="text-center max-w-md animate-pop-in w-full">
            <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-14 w-14 text-emerald-500" />
            </div>
            <h1 className="text-3xl font-extrabold text-foreground">Pedido enviado</h1>
            <p className="text-muted-foreground mt-2 text-lg leading-relaxed">
              Vamos preparar sua cesta com carinho 🥬✨
            </p>

            {/* Card do pedido com detalhes */}
            <div className="mt-6 rounded-2xl gradient-card border border-primary/20 p-5 text-left space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                🛒 Seu pedido
              </p>
              <p className="text-lg font-extrabold text-foreground">Carrinho Personalizado</p>
              
              {/* Lista de itens confirmados */}
              {confirmedItems.length > 0 && (
                <div className="mt-3 space-y-2 max-h-48 overflow-y-auto border-t border-primary/10 pt-3">
                  {confirmedItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-start text-sm">
                      <div className="flex-1">
                        <p className="font-semibold text-foreground">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.sold_by === 'weight' ? (
                            <>
                              {item.weight_kg < 1 
                                ? `${Math.round(item.weight_kg * 1000)}g` 
                                : `${item.weight_kg.toFixed(2)}kg`}
                              {' '}× R$ {(item.price_per_kg ?? item.price).toFixed(2).replace(".", ",")}
                            </>
                          ) : (
                            <>
                              {item.quantity} unidade{item.quantity > 1 ? "s" : ""} × R$ {(item.price_per_unit ?? item.price).toFixed(2).replace(".", ",")}
                            </>
                          )}
                        </p>
                        {item.item_notes?.trim() && (
                          <p className="text-xs text-amber-700 mt-0.5">Obs: {item.item_notes.trim()}</p>
                        )}
                      </div>
                      <p className="font-bold text-primary ml-2">
                        {item.sold_by === "weight"
                          ? `R$ ${item.price.toFixed(2).replace(".", ",")}`
                          : `R$ ${((item.price_per_unit ?? item.price) * (item.quantity || 1)).toFixed(2).replace(".", ",")}`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Total */}
              <div className="border-t border-primary/10 pt-3 mt-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-muted-foreground">Total do pedido</span>
                  <span className="text-3xl font-extrabold text-primary">
                    R$ {confirmedTotal.toFixed(2).replace(".", ",")}
                  </span>
                </div>
                {confirmedPayment && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Pagamento: {paymentLabel(confirmedPayment)} — somente na entrega.
                  </p>
                )}
                {confirmedItems.some((item) => item.sold_by === "unit") && (
                  <p className="text-xs text-amber-600 mt-2">
                    Itens por unidade podem ser conferidos na pesagem da entrega.
                  </p>
                )}
              </div>
            </div>

            {/* Botão de acompanhamento em tempo real */}
            <button
              onClick={() => navigate(`/${slug}/pedido/${confirmedOrderId}`)}
              className="mt-6 w-full h-13 py-3.5 rounded-2xl gradient-hero text-white font-extrabold text-base shadow-button flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            >
              <Package className="h-5 w-5" />
              Acompanhar Pedido em Tempo Real
            </button>

            <p className="text-xs text-center text-muted-foreground mt-3 px-4">
              Atualizações automáticas do status da sua entrega
            </p>

            <button
              onClick={() => navigate(`/${slug}/rastrear`)}
              className="mt-3 w-full h-13 py-3.5 rounded-2xl border-2 border-emerald-600 text-emerald-700 font-extrabold text-base hover:bg-emerald-50 transition-colors"
            >
              Meus pedidos
            </button>

            <button
              onClick={() => {
                setStep("basket");
                setConfirmedItems([]);
                setConfirmedOrderId("");
                setConfirmedPhone("");
                setConfirmedPayment("");
              }}
              className="mt-4 w-full h-13 py-3.5 rounded-2xl border-2 border-primary text-primary font-extrabold text-base hover:bg-accent transition-colors"
            >
              ← Fazer Novo Pedido
            </button>
          </div>
        </main>
      </div>
    );
  }

  /* ─── Cesta + Checkout ─── */
  return (
    <div className="min-h-screen bg-background dark:bg-slate-900 flex flex-col">
      {/* Header — identidade da loja (não da plataforma) */}
      <header className="gradient-hero px-4 py-6 shadow-md">
        <div className="mx-auto max-w-lg flex items-center gap-3">
          <div className="h-20 w-20 rounded-2xl bg-white/20 flex items-center justify-center overflow-hidden p-1.5 shrink-0 ring-2 ring-white/30">
            <StoreLogo
              logoPath={store.logo_path}
              logoVersion={store.updated_at}
              alt={store.name}
              className="h-full w-full"
              imgClassName="w-full h-full object-contain"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold text-white leading-tight truncate">
              {store.name}
            </h1>
            <p className="text-sm text-white/85 mt-0.5">
              Escolha seus produtos e faça seu pedido.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/${slug}/rastrear`)}
            className="h-10 px-3 rounded-xl bg-white/20 text-white text-xs font-bold inline-flex items-center gap-1.5 hover:bg-white/30 shrink-0"
          >
            <ClipboardList className="h-4 w-4" />
            Meus pedidos
          </button>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg px-4 pb-10 flex-1">
        {/* Etapa 1: Carrinho/Cesta */}
        {step === "basket" && (
          <div className="animate-slide-up">
            {operationalSettings?.deliveryHoursMessage && (
              <p className="mt-4 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                {operationalSettings.deliveryHoursMessage}
              </p>
            )}
            {outsideDeliveryHours && operationalSettings?.outsideHoursMessage && (
              <p className="mt-2 text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                {operationalSettings.outsideHoursMessage}
              </p>
            )}
            {/* Hero da cesta */}
            <div className="mt-5 rounded-3xl gradient-card border border-primary/20 p-5 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="text-xs font-extrabold uppercase tracking-widest text-primary/70">
                    🥗 Produtos Disponíveis
                  </p>
                  <h2 className="text-2xl font-extrabold text-foreground mt-1">Monte sua Cesta</h2>
                  
                  {/* Total Estimado */}
                  {cartTotal > 0 ? (
                    <div className="mt-2">
                      <p className="text-4xl font-extrabold text-primary">
                        {formatCurrency(cartTotal)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Total da cesta
                      </p>
                    </div>
                  ) : (
                    <p className="text-4xl font-extrabold text-slate-400 mt-2">
                      R$ 0,00
                    </p>
                  )}
                  
                  {/* Informações dos itens */}
                  <div className="mt-2 space-y-0.5">
                    <p className="text-xs text-muted-foreground">
                      {totalItems} item(s) selecionado(s)
                      {categoryCounts ? ` — ${categoryCounts.totalActive.toLocaleString("pt-BR")} no catálogo` : null}
                    </p>
                    
                    {/* Itens por peso (com valor confirmado) */}
                    {itemsByWeight > 0 && (
                      <p className="text-xs text-emerald-600 font-semibold">
                        ✓ {itemsByWeight} por peso: {formatCurrency(cartEstimates.weightItemsTotal)}
                      </p>
                    )}
                    
                    {/* Itens por unidade (com estimativa) */}
                    {itemsByUnit > 0 && (
                      <p className="text-xs text-amber-700 font-semibold">
                        {itemsByUnit} por unidade: {formatCurrency(cartEstimates.unitItemsSubtotal)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-5xl mt-1">🧺</div>
              </div>
              
              {/* Aviso de variação de preço */}
              {itemsByUnit > 0 && (
                <div className="mt-4">
                  <CartEstimateWarning 
                    hasUnitItems={true} 
                    itemsWithoutEstimate={cartEstimates.unitItemsWithoutEstimate}
                    compact={true}
                  />
                </div>
              )}
              
              {/* Prévia dos itens selecionados */}
              {totalItems > 0 && (
                <div className="mt-4 pt-4 border-t border-primary/10">
                  <CartLineNotesPanel
                    lines={resolvedCartLines}
                    onUpdateNotes={updateLineNotes}
                    onRemoveLine={removeCartLine}
                  />
                </div>
              )}
            </div>

            {/* Lista de produtos */}
            <div className="mt-5 space-y-3">
              <h3 className="text-sm font-extrabold text-muted-foreground uppercase tracking-wider px-1">
                Catálogo
              </h3>
              
              <div className="space-y-3">
                <CategoryFilter 
                  storeId={store.id} 
                  selectedCategory={selectedCategory}
                  onSelectCategory={handleSelectCategory}
                  requireSelection
                  productCounts={categoryCounts?.byCategoryId}
                />
                {selectedCategory && (
                  <ProductSearch onSearch={setSearchQuery} />
                )}
              </div>

              {!selectedCategory && (
                <div className="text-center py-10 rounded-2xl border border-dashed border-border bg-card/50">
                  <Package className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-foreground">Selecione uma categoria</p>
                  <p className="text-xs text-muted-foreground mt-1 px-6">
                    Os produtos aparecem filtrados pela categoria escolhida nesta loja.
                  </p>
                </div>
              )}

              {selectedCategory && isCatalogError && (
                <div className="text-center py-10 rounded-2xl border border-destructive/30 bg-destructive/5">
                  <p className="text-sm font-medium text-destructive">
                    Não foi possível carregar os produtos desta categoria.
                  </p>
                  <button
                    type="button"
                    onClick={() => refetchCatalog()}
                    className="mt-3 text-sm font-bold text-primary underline"
                  >
                    Tentar novamente
                  </button>
                </div>
              )}

              {selectedCategory && isCatalogLoading && (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              )}

              {selectedCategory && selectedCategoryHasNoProducts && !isCatalogLoading && (
                <div className="text-center py-10 rounded-2xl border border-border bg-card">
                  <p className="text-sm font-medium text-muted-foreground">
                    Esta categoria ainda não possui produtos disponíveis.
                  </p>
                </div>
              )}

              {selectedCategory && !selectedCategoryHasNoProducts && !isCatalogLoading && !isCatalogError && catalogProducts.length === 0 && searchQuery && (
                <div className="text-center py-12">
                  <Package className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">Nenhum produto encontrado nesta busca</p>
                </div>
              )}

              {selectedCategory && !isCatalogLoading && !isCatalogError && catalogProducts.map((p, i) => {
                const mode = getProductMode(p);
                const productLines = resolvedCartLines.filter((l) => l.productId === p.id);
                const cartQty = productLines
                  .filter((l) => l.soldBy === 'unit')
                  .reduce((s, l) => s + l.quantity, 0);
                const cartWeight = productLines
                  .filter((l) => l.soldBy === 'weight')
                  .reduce((s, l) => s + l.weightKg, 0);

                return (
                <div key={p.id} className="animate-slide-up" style={{ animationDelay: `${i * 40}ms`, opacity: 0 }}>
                  <ProductCard
                    product={p}
                    cartQty={mode === 'unit' ? cartQty : productLines.filter((l) => l.soldBy === 'weight').length}
                    cartWeight={cartWeight > 0 ? cartWeight : undefined}
                    onAdd={() => handleAdd(p)}
                    onRemove={() => handleRemove(p)}
                    onSelectWeight={() => setWeightModalProduct(p)}
                    selectedMode={productMode[p.id]}
                    onToggleMode={() => handleToggleMode(p.id)}
                  />
                </div>
              );})}

              {selectedCategory && hasNextPage && !isCatalogError && (
                <div className="pt-2 pb-4">
                  <button
                    type="button"
                    disabled={isFetchingNextPage}
                    onClick={() => fetchNextPage()}
                    className="w-full h-11 rounded-xl border border-border bg-card text-sm font-bold text-foreground hover:bg-muted disabled:opacity-60 inline-flex items-center justify-center gap-2"
                  >
                    {isFetchingNextPage ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Carregando...
                      </>
                    ) : (
                      <>Carregar mais ({catalogProducts.length} de {catalogTotalInCategory.toLocaleString("pt-BR")})</>
                    )}
                  </button>
                </div>
              )}
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
                Pagamento realizado somente no momento da entrega.
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
              storeSlug={store.slug}
              estimatedTotal={cartEstimates.totalEstimate}
              hasUnitItems={itemsByUnit > 0}
              itemsWithoutEstimate={cartEstimates.unitItemsWithoutEstimate}
              cartLines={cartLinesSummary}
              itemCount={totalItems}
              operationalSettings={operationalSettings ?? undefined}
              outsideDeliveryHours={outsideDeliveryHours}
              onBack={() => setStep("basket")}
              onSubmit={(data) => {
                const selectedProducts = resolvedCartLines.map((line) => {
                  const p = line.product;
                  if (line.soldBy === 'weight') {
                    return {
                      ...p,
                      quantity: 1,
                      weight_kg: line.weightKg,
                      price: line.lineSubtotal,
                      sold_by: 'weight' as const,
                      item_notes: line.itemNotes,
                    };
                  }
                  return {
                    ...p,
                    quantity: line.quantity,
                    price: p.price_per_unit ?? p.price,
                    sold_by: 'unit' as const,
                    item_notes: line.itemNotes,
                  };
                });

                createOrder.mutate(
                  {
                    customer_name: data.customer_name,
                    phone: data.phone,
                    address: data.address,
                    products: selectedProducts,
                    storeSlug: store.slug,
                    delivery_zone_id: data.neighborhood_id,
                    coupon_code: data.coupon_code,
                    payment_method: toStoredPaymentMethod(data.payment_method),
                    notes: data.notes,
                    email: data.email,
                    privacy_acknowledged: data.privacy_acknowledged,
                  },
                  {
                    onSuccess: (order) => {
                      toast.success("Pedido enviado com sucesso!");
                      setConfirmedTotal(Number(order.total ?? data.total_with_fee ?? cartTotal));
                      setConfirmedItems(selectedProducts);
                      setConfirmedOrderId(order.id);
                      setConfirmedPhone(data.phone);
                      setConfirmedPayment(data.payment_method);
                      saveTrackingPhone(order.id, data.phone);
                      saveLastOrderPhone(data.phone);
                      setCartLines([]);
                      setProductMode({});
                      setStep("confirmation");
                    },
                    onError: (err: any) => {
                      const msg = String(err?.message || "");
                      if (msg.toLowerCase().includes("active order exists")) {
                        toast.error("Você já possui um pedido em andamento. Aguarde a entrega ou a finalização do pedido antes de realizar uma nova compra.");
                        return;
                      }
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

      {/* Footer — plataforma secundária */}
      <footer className="py-6 text-center border-t mt-auto">
        <p className="text-[10px] text-slate-400 font-medium">
          © {new Date().getFullYear()} {store?.name} · Pedidos seguros
        </p>
        <p className="text-[10px] text-slate-400/80 font-medium mt-1">
          Tecnologia HortiDelivery
        </p>
      </footer>

    </div>
  );
}
