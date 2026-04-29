import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Leaf, Plus, Trash2, ArrowLeft, Loader2, Save, Truck, Package, Scale, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useDeliveryZones, useManageDeliveryZone } from "@/hooks/useDeliveryZones";
import { ProductWeightSettings } from "@/components/admin/ProductWeightSettings";
import { useTenant } from "@/contexts/TenantContext";

export default function AdminBasket() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { store: tenantStore, isLoading: isTenantLoading } = useTenant();
  const tenantStoreId = tenantStore?.id;

  const STORE_PRODUCTS_KEY = ["admin-store-products", tenantStoreId] as const;
  
  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [newProductQuantity, setNewProductQuantity] = useState("1");
  const [newProductUnit, setNewProductUnit] = useState("un");
  const [newProductSellBy, setNewProductSellBy] = useState<"unit" | "weight" | "both">("unit");
  const [newProductImageUrl, setNewProductImageUrl] = useState("");
  const [newProductImageFile, setNewProductImageFile] = useState<File | null>(null);
  const [basketName, setBasketName] = useState("");
  const [basketPrice, setBasketPrice] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneFee, setNewZoneFee] = useState("");
  const { data: zones } = useDeliveryZones();
  const { addZone, deleteZone } = useManageDeliveryZone();

  const [editingItem, setEditingItem] = useState<any>(null);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [productFilter, setProductFilter] = useState("");
  const [editingWeightProductId, setEditingWeightProductId] = useState<string | null>(null);

  const resolveSellBy = (unit: string, sellBy?: string) => {
    if (unit === "un") return "unit";
    if (sellBy === "both" || sellBy === "weight") return sellBy;
    return "weight";
  };

  const uploadProductImageFile = async (productId: string, file: File) => {
    const fileExt = file.name.split(".").pop() || "jpg";
    const filePath = `${Date.now()}_${productId}.${fileExt}`;
    const { error } = await supabase.storage
      .from("arquivos")
      .upload(filePath, file, {
        contentType: file.type || "image/jpeg",
        upsert: true,
      });
    if (error) throw new Error(error.message || "Falha ao enviar imagem");

    const { data: urlData } = supabase.storage.from("arquivos").getPublicUrl(filePath);
    return urlData.publicUrl;
  };

  const { data: basket, isLoading: isBasketLoading } = useQuery({
    queryKey: ["admin-active-basket", tenantStoreId],
    queryFn: async () => {
      if (!tenantStoreId) return null;

      const { data: bData, error: bErr } = await supabase
        .from("baskets")
        .select("*")
        .eq("store_id", tenantStoreId)
        .eq("active", true)
        .limit(1)
        .maybeSingle();

      if (bErr) throw bErr;
      if (!bData) return null;

      const { data: items, error: iErr } = await supabase
        .from("basket_items")
        .select("id, quantity, products(id, name, price, unit, active, in_stock, image_url, price_per_kg, average_weight, weight_variance, sell_by)")
        .eq("basket_id", bData.id)
        .order("id");

      if (iErr) throw iErr;

      return {
        ...bData,
        items: items || [],
      };
    },
    enabled: !!tenantStoreId,
  });

  /** Mesma origem que o cliente em useActiveBasket: todos os produtos ativos da loja */
  const { data: allProducts = [], isLoading: isStoreProductsLoading } = useQuery({
    queryKey: STORE_PRODUCTS_KEY,
    queryFn: async () => {
      if (!tenantStoreId) return [];

      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("store_id", tenantStoreId)
        .eq("active", true)
        .order("name");

      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantStoreId && showAllProducts,
  });

  const filteredProducts = allProducts.filter((product: any) =>
    product.name?.toLowerCase().includes(productFilter.toLowerCase())
  );

  const isLoading = isTenantLoading || isBasketLoading;

  const addToBasketMutation = useMutation({
    mutationFn: async (productId: string) => {
      if (!basket) throw new Error("Cesta não encontrada");
      if (!tenantStoreId) throw new Error("Loja não carregada");
      
      const { error } = await supabase
        .from("basket_items")
        .insert([{ basket_id: basket.id, product_id: productId, quantity: 1, store_id: tenantStoreId }]);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produto adicionado à cesta!");
      queryClient.invalidateQueries({ queryKey: ["admin-active-basket"] });
      if (tenantStoreId) {
        queryClient.invalidateQueries({ queryKey: ["admin-store-products", tenantStoreId] });
      }
    },
    onError: (err: any) => toast.error(err.message)
  });

  const updateBasketMutation = useMutation({
    mutationFn: async () => {
      if (!basket) return;
      const { error } = await supabase
        .from("baskets")
        .update({
          name: basketName || basket.name,
          price: parseFloat(basketPrice) || basket.price,
        })
        .eq("id", basket.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cesta atualizada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["admin-active-basket"] });
      if (tenantStoreId) {
        queryClient.invalidateQueries({ queryKey: ["admin-store-products", tenantStoreId] });
      }
    },
    onError: (err: any) => toast.error("Erro ao atualizar a cesta: " + err.message)
  });

  const addProductMutation = useMutation({
    mutationFn: async () => {
      if (!basket) throw new Error("Cesta não encontrada");
      if (!tenantStoreId) throw new Error("Loja não carregada");
      
      const priceVal = parseFloat(newProductPrice.replace(",", "."));
      const qtyVal = parseInt(newProductQuantity, 10);
      
      if (!newProductName || isNaN(priceVal) || isNaN(qtyVal)) {
        throw new Error("Preencha todos os campos corretamente");
      }

      // Pega o store_id da cesta ativa e garante alinhamento com o tenant
      const { data: basketData } = await supabase
        .from("baskets").select("store_id").eq("id", basket.id).single();
      const effectiveStoreId = tenantStoreId;

      if (basketData?.store_id !== tenantStoreId) {
        await supabase.from("baskets").update({ store_id: tenantStoreId }).eq("id", basket.id);
      }

      // 1. Criar o produto com store_id
      let finalImageUrl = newProductImageUrl;
      const shouldUploadImage = !!newProductImageFile;

      const defaultAverageWeight = 0.3;
      const defaultWeightVariance = 0.15;
      const sellBy = resolveSellBy(newProductUnit, newProductSellBy);
      const normalizedPricePerKg = sellBy === "unit" ? null : priceVal;

      const { data: prodData, error: prodErr } = await supabase
        .from("products")
        .insert([{
          name: newProductName,
          price: priceVal,
          unit: newProductUnit,
          image_url: shouldUploadImage ? null : finalImageUrl,
          active: true,
          store_id: effectiveStoreId,
          sell_by: sellBy,
          average_weight: sellBy === "unit" ? null : defaultAverageWeight,
          weight_variance: defaultWeightVariance,
          price_per_kg: normalizedPricePerKg,
        }])
        .select()
        .single();

      if (prodErr || !prodData) throw prodErr || new Error("Erro ao criar produto");

      if (shouldUploadImage && newProductImageFile) {
        finalImageUrl = await uploadProductImageFile(prodData.id, newProductImageFile);
        const { error: imgErr } = await supabase
          .from("products")
          .update({ image_url: finalImageUrl })
          .eq("id", prodData.id);

        if (imgErr) throw imgErr;
      }

      // 2. Vincular na cesta
      const { error: itemErr } = await supabase
        .from("basket_items")
        .insert([{
          basket_id: basket.id,
          product_id: prodData.id,
          quantity: qtyVal,
          store_id: tenantStoreId,
        }]);

      if (itemErr) throw itemErr;

      return prodData;
    },
    onSuccess: (createdProduct) => {
      toast.success("Produto adicionado à cesta!");
      setNewProductName("");
      setNewProductPrice("");
      setNewProductQuantity("1");
      setNewProductUnit("un");
      setNewProductSellBy("unit");
      setNewProductImageUrl("");
      setNewProductImageFile(null);
      setProductFilter("");
      setShowAllProducts(true);
      queryClient.invalidateQueries({ queryKey: ["admin-active-basket"] });
      if (tenantStoreId) {
        queryClient.invalidateQueries({ queryKey: ["admin-store-products", tenantStoreId] });
        queryClient.setQueryData(["admin-store-products", tenantStoreId], (prev: any) => {
          if (!createdProduct) return prev;
          const prevList = Array.isArray(prev) ? prev : [];
          if (prevList.some((p: any) => p.id === createdProduct.id)) return prevList;
          return [createdProduct, ...prevList];
        });
      }
    },
    onError: (err: any) => toast.error(err.message)
  });

  const bulkImportMutation = useMutation({
    mutationFn: async (items: {name: string; price: number; unit: string; active: boolean}[]) => {
      if (!basket) throw new Error("Cesta não encontrada");

      // Pega o store_id da cesta ativa e garante alinhamento com o tenant
      const { data: basketData } = await supabase
        .from("baskets").select("store_id").eq("id", basket.id).single();
      const effectiveStoreId = tenantStoreId;

      if (basketData?.store_id !== tenantStoreId) {
        await supabase.from("baskets").update({ store_id: tenantStoreId }).eq("id", basket.id);
      }
      const defaultAverageWeight = 0.3;
      const defaultWeightVariance = 0.15;
      const itemsWithStore = items.map((i) => {
        const sellBy = i.unit === "un" ? "unit" : "weight";
        return {
          ...i,
          store_id: effectiveStoreId,
          sell_by: sellBy,
          average_weight: sellBy === "unit" ? null : defaultAverageWeight,
          weight_variance: defaultWeightVariance,
          price_per_kg: sellBy === "unit" ? null : i.price,
        };
      });
      
      const { data: prods, error: prodErr } = await supabase
        .from("products")
        .insert(itemsWithStore)
        .select();

      if (prodErr) throw prodErr;
      if (!prods || prods.length === 0) throw new Error("Nenhum produto criado");

      const basketItems = prods.map(p => ({
        basket_id: basket.id,
        product_id: p.id,
        quantity: 1,
        store_id: tenantStoreId,
      }));

      const { error: itemErr } = await supabase
        .from("basket_items")
        .insert(basketItems);

      if (itemErr) throw itemErr;
    },
    onSuccess: () => {
      toast.success("Mercadorias importadas para a cesta com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["admin-active-basket"] });
      if (tenantStoreId) {
        queryClient.invalidateQueries({ queryKey: ["admin-store-products", tenantStoreId] });
      }
    },
    onError: (err: any) => toast.error("Erro na importação: " + err.message)
  });

  const removeItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from("basket_items").delete().eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produto removido!");
      queryClient.invalidateQueries({ queryKey: ["admin-active-basket"] });
    },
    onError: (err: any) => toast.error(err.message)
  });

  const editItemMutation = useMutation({
    mutationFn: async (data: { itemId: string; productId: string; name: string; quantity: number; price: number; unit: string; sellBy?: string; image_url: string; image_file?: File | null }) => {
      let imageUrl = data.image_url;
      if (data.image_file) {
        imageUrl = await uploadProductImageFile(data.productId, data.image_file);
      }

      // 1. Atualizar produto
      const sellBy = resolveSellBy(data.unit, data.sellBy);
      const { error: prodErr } = await supabase
        .from("products")
        .update({
          name: data.name,
          price: data.price,
          unit: data.unit,
          image_url: imageUrl,
          sell_by: sellBy,
          price_per_kg: sellBy === "unit" ? null : data.price,
          ...(sellBy === "unit" ? { average_weight: null } : {}),
        })
        .eq("id", data.productId);
      if (prodErr) throw prodErr;

      // 2. Atualizar quantidade na cesta
      const { error: itemErr } = await supabase
        .from("basket_items")
        .update({ quantity: data.quantity })
        .eq("id", data.itemId);
      if (itemErr) throw itemErr;
    },
    onSuccess: () => {
      toast.success("Item atualizado!");
      setEditingItem(null);
      queryClient.invalidateQueries({ queryKey: ["admin-active-basket"] });
      if (tenantStoreId) {
        queryClient.invalidateQueries({ queryKey: ["admin-store-products", tenantStoreId] });
      }
    },
    onError: (err: any) => toast.error("Erro ao salvar: " + err.message)
  });

  const toggleStockMutation = useMutation({
    mutationFn: async ({ productId, inStock }: { productId: string, inStock: boolean }) => {
      const { error } = await supabase.from("products").update({ in_stock: inStock } as any).eq("id", productId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Estoque atualizado!");
      queryClient.invalidateQueries({ queryKey: ["admin-active-basket"] });
      if (tenantStoreId) {
        queryClient.invalidateQueries({ queryKey: ["admin-store-products", tenantStoreId] });
      }
    }
  });

  const uploadImageMutation = useMutation({
    mutationFn: async ({ productId, file }: { productId: string, file: File }) => {
      const imageUrl = await uploadProductImageFile(productId, file);
      const { error: updateErr } = await supabase
        .from('products')
        .update({ image_url: imageUrl })
        .eq('id', productId);
        
      if (updateErr) throw updateErr;
      return { productId, imageUrl };
    },
    onSuccess: ({ productId, imageUrl }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-active-basket"] });
      if (tenantStoreId) {
        queryClient.invalidateQueries({ queryKey: ["admin-store-products", tenantStoreId] });
        queryClient.setQueryData(["admin-store-products", tenantStoreId], (prev: any) => {
          if (!prev || !Array.isArray(prev)) return prev;
          return prev.map((p: any) =>
            p.id === productId ? { ...p, image_url: imageUrl } : p
          );
        });
      }
    }
  });

  const editProductMutation = useMutation({
    mutationFn: async (data: { productId: string; name: string; price: number; unit: string; sellBy?: string; image_url: string; image_file?: File | null }) => {
      let imageUrl = data.image_url;
      if (data.image_file) {
        imageUrl = await uploadProductImageFile(data.productId, data.image_file);
      }

      const sellBy = resolveSellBy(data.unit, data.sellBy);
      const { data: updated, error } = await supabase
        .from("products")
        .update({
          name: data.name,
          price: data.price,
          unit: data.unit,
          image_url: imageUrl,
          sell_by: sellBy,
          price_per_kg: sellBy === "unit" ? null : data.price,
          ...(sellBy === "unit" ? { average_weight: null } : {}),
        })
        .eq("id", data.productId);
      if (error) throw error;
      return { productId: data.productId, imageUrl, name: data.name, price: data.price, unit: data.unit, updated };
    },
    onSuccess: ({ productId, imageUrl, name, price, unit }) => {
      toast.success("Produto atualizado!");
      setEditingProduct(null);
      queryClient.invalidateQueries({ queryKey: ["admin-active-basket"] });
      if (tenantStoreId) {
        queryClient.invalidateQueries({ queryKey: ["admin-store-products", tenantStoreId] });
        queryClient.setQueryData(["admin-store-products", tenantStoreId], (prev: any) => {
          if (!prev || !Array.isArray(prev)) return prev;
          return prev.map((p: any) =>
            p.id === productId ? { ...p, image_url: imageUrl, name, price, unit } : p
          );
        });
      }
    },
    onError: (err: any) => toast.error("Erro ao salvar: " + err.message)
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      // Remove itens vinculados à cesta antes de excluir o produto
      const { error: itemErr } = await supabase
        .from("basket_items")
        .delete()
        .eq("product_id", productId);
      if (itemErr) throw itemErr;

      const { data: deletedProducts, error } = await supabase
        .from("products")
        .delete()
        .eq("id", productId)
        .select("id");
      if (error) throw error;
      if (!deletedProducts || deletedProducts.length === 0) {
        throw new Error("Produto não foi excluído no banco.");
      }
    },
    onSuccess: (_data, productId) => {
      toast.success("Produto excluído!");
      queryClient.invalidateQueries({ queryKey: ["admin-active-basket"] });
      queryClient.invalidateQueries({ queryKey: ["active-basket"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      if (tenantStoreId) {
        queryClient.invalidateQueries({ queryKey: ["admin-store-products", tenantStoreId] });
        queryClient.setQueryData(["admin-store-products", tenantStoreId], (prev: any) => {
          if (!Array.isArray(prev)) return prev;
          return prev.filter((p: any) => p.id !== productId);
        });
      }
    },
    onError: (err: any) => toast.error("Erro ao excluir: " + err.message)
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 text-primary animate-spin" />
        <p className="text-muted-foreground mt-4 font-bold">Carregando itens...</p>
      </div>
    );
  }

  if (!basket) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-bold mb-2">Ops! Sem cesta ativa.</h1>
        <p className="text-muted-foreground mb-4">Você precisa ter uma cesta ativa no banco de dados.</p>
        <button onClick={() => navigate("/admin")} className="text-primary font-bold flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar ao Painel
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="gradient-hero px-4 py-5 shadow-md sticky top-0 z-20">
        <div className="mx-auto max-w-2xl flex items-center gap-3">
          <button onClick={() => navigate("/admin")} className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center text-white hover:bg-white/30 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-base font-extrabold text-white leading-tight">Painel de Produtos</h1>
            <p className="text-xs text-white/75">Altere mercadorias, títulos e valores da sua loja</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl w-full px-4 py-6 flex-1 space-y-6">
        
        {/* Configurações Gerais da Cesta */}
        <div className="bg-card p-5 rounded-2xl shadow-sm border border-border">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <Leaf className="h-4 w-4 text-primary" /> Configurações do Catálogo
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-muted-foreground">Título Principal (Ex: Hortifruti do João ou Produtos do Dia)</label>
              <input 
                type="text" 
                defaultValue={basket.name}
                onChange={(e) => setBasketName(e.target.value)}
                className="w-full mt-1 h-11 px-3 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 bg-card text-foreground" 
              />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground">Valor Mínimo para Pedido (R$)</label>
              <input 
                type="number" 
                defaultValue={basket.price}
                onChange={(e) => setBasketPrice(e.target.value)}
                className="w-full mt-1 h-11 px-3 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 bg-card text-foreground" 
              />
            </div>
            <button 
              onClick={() => updateBasketMutation.mutate()}
              disabled={updateBasketMutation.isPending}
              className="h-11 px-5 rounded-xl gradient-hero text-white text-sm font-bold flex items-center gap-2 justify-center shadow-button w-full sm:w-auto"
            >
              {updateBasketMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar Alterações Globais
            </button>
          </div>
        </div>

        {/* Zonas de Entrega */}
        <div className="bg-card p-5 rounded-2xl shadow-sm border border-border">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" /> Taxas de Entrega / Bairros
          </h2>
          <div className="flex gap-2 mb-4">
            <input type="text" placeholder="Bairro (ex: Centro)" value={newZoneName} onChange={e => setNewZoneName(e.target.value)} className="w-full h-11 px-3 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm bg-card text-foreground" />
            <input type="number" placeholder="Taxa R$ (ex: 5.00)" value={newZoneFee} onChange={e => setNewZoneFee(e.target.value)} className="w-[100px] sm:w-[120px] shrink-0 h-11 px-3 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm bg-card text-foreground" />
            <button 
              onClick={() => {
                if(newZoneName.trim() && !isNaN(parseFloat(newZoneFee))) {
                  addZone.mutate({ name: newZoneName, fee: parseFloat(newZoneFee) }, {
                    onSuccess: () => {
                      setNewZoneName(""); setNewZoneFee(""); toast.success("Bairro adicionado");
                    }
                  });
                }
              }}
              disabled={addZone.isPending}
              className="h-11 w-11 rounded-xl bg-primary text-white flex items-center justify-center shrink-0 disabled:opacity-50"
            >
              {addZone.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
          </div>
          <div className="space-y-2">
            {zones?.length === 0 && <p className="text-xs text-muted-foreground text-center bg-muted p-3 rounded-lg border border-border">Nenhum bairro cadastrado. Seus clientes enviarão pedidos sem taxa de frete no momento.</p>}
            {zones?.map(z => (
              <div key={z.id} className="flex items-center justify-between gap-3 p-2.5 px-3 rounded-xl bg-muted border border-border">
                <span className="font-bold text-sm text-foreground flex-1 min-w-0 truncate">
                  {z.name || z.neighborhood || "Bairro sem nome"}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-primary font-bold">R$ {z.fee.toFixed(2).replace(".", ",")}</span>
                  <button onClick={() => deleteZone.mutate(z.id)} className="text-red-400 p-1 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Adicionar Produto */}
        <div className="bg-card p-5 rounded-2xl shadow-sm border border-border">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <Plus className="h-4 w-4 text-emerald-500" /> Adicionar Mercadoria
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-bold text-muted-foreground">Nome (Ex: Tomate)</label>
              <input 
                type="text" 
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                className="w-full mt-1 h-11 px-3 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 bg-card text-foreground" 
              />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground">Medida</label>
              <select 
                value={newProductUnit}
                onChange={(e) => {
                  const nextUnit = e.target.value;
                  setNewProductUnit(nextUnit);
                  if (nextUnit === "un") setNewProductSellBy("unit");
                }}
                className="w-full mt-1 h-11 px-3 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 bg-card text-foreground" 
              >
                <option value="un">Unidade(s)</option>
                <option value="kg">Quilo(s)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground">Forma de venda</label>
              <select
                value={newProductUnit === "un" ? "unit" : newProductSellBy}
                onChange={(e) => setNewProductSellBy(e.target.value as "unit" | "weight" | "both")}
                disabled={newProductUnit === "un"}
                className="w-full mt-1 h-11 px-3 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 bg-card text-foreground disabled:opacity-60"
              >
                <option value="unit">Somente unidade</option>
                <option value="weight">Somente peso</option>
                <option value="both">Unidade e peso</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground">Preço (R$)</label>
              <input 
                type="text" 
                value={newProductPrice}
                onChange={(e) => setNewProductPrice(e.target.value)}
                placeholder="4.50"
                className="w-full mt-1 h-11 px-3 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 bg-card text-foreground" 
              />
            </div>
            <div className="sm:col-span-4">
              <label className="text-xs font-bold text-muted-foreground">Link da Foto (Internet)</label>
              <input 
                type="text" 
                value={newProductImageUrl}
                onChange={(e) => setNewProductImageUrl(e.target.value)}
                placeholder="https://exemplo.com/foto.jpg"
                className="w-full mt-1 h-11 px-3 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 bg-card text-foreground" 
              />
            </div>
            <div className="sm:col-span-4">
              <label className="text-xs font-bold text-muted-foreground">Ou envie foto da galeria/câmera</label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => setNewProductImageFile(e.target.files?.[0] || null)}
                className="w-full mt-1 h-11 px-3 py-2 border border-border rounded-xl text-sm bg-card text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-primary file:font-semibold"
              />
              {newProductImageFile && (
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  Selecionado: {newProductImageFile.name}
                </p>
              )}
            </div>
          </div>
          
          <div className="mt-4 flex flex-col gap-3">
              <button 
                onClick={() => addProductMutation.mutate()}
                disabled={addProductMutation.isPending}
                className="w-full h-11 rounded-xl bg-slate-900 hover:bg-slate-800 transition-colors text-white text-sm font-bold flex items-center justify-center gap-2"
              >
                {addProductMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                <span>Adicionar</span>
              </button>

              <div className="pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground text-center mb-2">Ou adicione vários itens usando CSV ou TXT (Nome, Preço, Kg/Un)</p>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept=".csv,.txt"
                  onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                         try {
                           const rawText = await file.text();
                           // Limpa quebras nulas, contra-barras perigosas ou caracteres nulos que o Postgres rejeita
                           const text = rawText
                             .replace(/\x00/g, '')
                             .replace(/\\u/gi, 'u') 
                             .replace(/\\/g, '-');

                           const lines = text.split('\n').filter(l => l.trim().length > 0);
                           
                           const startIndex = lines[0].toLowerCase().includes('nome') ? 1 : 0;
                           const productsToInsert = [];
                           
                           for (let i = startIndex; i < lines.length; i++) {
                               const parts = lines[i].split(',').map(s => s.trim().replace(/[\x00-\x1F\x7F]/g, ''));
                               const name = parts[0];
                               if (!name) continue;
                               
                               const price = parseFloat(parts[1]?.replace(',', '.') || "0");
                               const unit = parts[2]?.toLowerCase().includes('kg') ? 'kg' : 'un';
                               
                               productsToInsert.push({ 
                                 name, 
                                 price: isNaN(price) ? 0 : price, 
                                 unit, 
                                 active: true 
                               });
                           }
                           
                           if (productsToInsert.length > 0) {
                              toast.loading(`Importando ${productsToInsert.length} produtos...`, { id: "import-toast" });
                              bulkImportMutation.mutate(productsToInsert, {
                                onSuccess: () => toast.success("Sucesso!", { id: "import-toast" }),
                                onError: () => toast.error("Erro ao importar", { id: "import-toast" })
                              });
                           } else {
                              toast.error("Nenhum produto válido encontrado.");
                           }
                         } catch (error) {
                           toast.error("Erro ao ler arquivo.");
                         }
                      }
                      e.target.value = ''; // Reset input
                  }}
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={bulkImportMutation.isPending}
                  className="w-full h-11 rounded-xl border border-dashed border-primary/50 text-primary bg-primary/5 hover:bg-primary/10 transition-colors text-sm font-bold flex items-center justify-center gap-2"
                >
                  {bulkImportMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  <span>Importar Mercadorias (Arquivo)</span>
                </button>
              </div>
          </div>
        </div>

        {/* Lista de Produtos */}
        {false && (
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted-foreground mb-3 px-1">
            Itens visíveis aos clientes ({basket.items.length})
          </h2>
          <div className="space-y-2">
            {basket.items.length === 0 && (
              <p className="text-center text-sm py-8 text-muted-foreground">Sua cesta está vazia.</p>
            )}
            {basket.items.map((item: any) => {
              const isEditing = editingItem?.id === item.id;

              return (
                <div key={item.id} className={`bg-card p-3 rounded-xl shadow-sm border border-border transition-all ${isEditing ? 'ring-2 ring-primary/30 border-primary/50' : ''}`}>
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <div className="col-span-2 sm:col-span-3">
                          <label className="text-xs font-bold text-muted-foreground">Nome</label>
                          <input 
                            type="text" 
                            value={editingItem.name} 
                            onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                            className="w-full h-9 px-3 border border-border rounded-lg text-sm bg-card text-foreground"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-muted-foreground">Medida</label>
                          <select 
                            value={editingItem.unit} 
                            onChange={(e) => {
                              const nextUnit = e.target.value;
                              setEditingItem({
                                ...editingItem,
                                unit: nextUnit,
                                sell_by: nextUnit === "un" ? "unit" : resolveSellBy(nextUnit, editingItem.sell_by),
                              });
                            }}
                            className="w-full h-9 px-3 border border-border rounded-lg text-sm bg-card text-foreground"
                          >
                            <option value="un">UN</option>
                            <option value="kg">KG</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-muted-foreground">Forma de venda</label>
                          <select
                            value={editingItem.unit === "un" ? "unit" : (editingItem.sell_by || "weight")}
                            onChange={(e) => setEditingItem({ ...editingItem, sell_by: e.target.value })}
                            disabled={editingItem.unit === "un"}
                            className="w-full h-9 px-3 border border-border rounded-lg text-sm bg-card text-foreground disabled:opacity-60"
                          >
                            <option value="unit">Somente unidade</option>
                            <option value="weight">Somente peso</option>
                            <option value="both">Unidade e peso</option>
                          </select>
                        </div>
                        <div className="col-span-1 sm:col-span-1">
                          <label className="text-xs font-bold text-muted-foreground">Preço (R$)</label>
                          <input 
                            type="number" 
                            step="0.01"
                            value={editingItem.price} 
                            onChange={(e) => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) || 0 })}
                            className="w-full h-9 px-3 border border-border rounded-lg text-sm bg-card text-foreground"
                          />
                        </div>
                        <div className="col-span-2 sm:col-span-3 flex items-center gap-2">
                          <div className="h-9 w-9 shrink-0 bg-muted border border-border rounded-lg flex items-center justify-center overflow-hidden">
                            {editingItem.image_file ? (
                              <img src={URL.createObjectURL(editingItem.image_file)} alt="" className="w-full h-full object-cover" />
                            ) : editingItem.image_url ? (
                              <img src={editingItem.image_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs">🖼️</span>
                            )}
                          </div>
                          <div className="flex-1">
                            <label className="text-xs font-bold text-muted-foreground">Link da Foto (Internet)</label>
                            <input 
                              type="text" 
                              value={editingItem.image_url || ""} 
                              onChange={(e) => setEditingItem({ ...editingItem, image_url: e.target.value })}
                              className="w-full h-9 px-3 border border-border rounded-lg text-sm bg-card text-foreground"
                              placeholder="https://..."
                            />
                          </div>
                        </div>
                        <div className="col-span-2 sm:col-span-3">
                          <label className="text-xs font-bold text-muted-foreground">Upload de foto (galeria/câmera)</label>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => setEditingItem({ ...editingItem, image_file: e.target.files?.[0] || null })}
                            className="w-full h-9 px-3 py-1 border border-border rounded-lg text-xs bg-card text-foreground file:mr-2 file:rounded-md file:border-0 file:bg-primary/10 file:px-2 file:py-1 file:text-primary file:font-semibold"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setEditingItem(null)}
                          className="flex-1 h-9 rounded-lg border border-border text-sm font-bold text-muted-foreground hover:bg-muted"
                        >
                          Cancelar
                        </button>
                        <button 
                          onClick={() => editItemMutation.mutate({
                            itemId: item.id,
                            productId: item.products.id,
                            name: editingItem.name,
                            quantity: editingItem.quantity || 1,
                            price: editingItem.price,
                            unit: editingItem.unit,
                            sellBy: editingItem.sell_by,
                            image_url: editingItem.image_url,
                            image_file: editingItem.image_file
                          })}
                          disabled={editItemMutation.isPending}
                          className="flex-1 h-9 rounded-lg bg-primary text-white text-sm font-bold flex items-center justify-center gap-1 hover:bg-primary/90"
                        >
                          {editItemMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3 animate-slide-up">
                      <div className="flex items-center gap-3">
                        <label className="h-10 w-10 shrink-0 bg-accent rounded-lg flex items-center justify-center text-lg cursor-pointer hover:brightness-95 transition-all overflow-hidden relative group shadow-sm border border-border/50" title="Mudar foto do produto">
                           {item.products.image_url ? (
                              <img src={item.products.image_url} alt="" className="w-full h-full object-cover" />
                           ) : (
                              <span className="opacity-80">🥬</span>
                           )}
                           <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Plus className="h-4 w-4 text-white" />
                           </div>
                           <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                              if (e.target.files?.[0]) {
                                 toast.loading("Enviando...", { id: `up-${item.id}` });
                                 uploadImageMutation.mutate({ productId: item.products.id, file: e.target.files[0] }, {
                                    onSuccess: () => toast.success("Foto atualizada!", { id: `up-${item.id}` }),
                                    onError: () => toast.error("Erro no envio", { id: `up-${item.id}` })
                                 });
                              }
                           }} />
                        </label>
                        <div>
                          <p className={`font-extrabold text-foreground ${!item.products.in_stock && 'line-through opacity-50'}`}>{item.products.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-muted-foreground">
                              Por {item.products.unit === "kg" ? "kg" : "und"} • R$ {item.products.price?.toFixed(2)}
                            </p>
                            <button 
                              onClick={() => toggleStockMutation.mutate({ productId: item.products.id, inStock: !item.products.in_stock })}
                              className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md transition-colors ${item.products.in_stock ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                            >
                              {item.products.in_stock ? 'Disponível' : 'Esgotado!'}
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button 
                          onClick={() => setEditingWeightProductId(
                            editingWeightProductId === item.products.id ? null : item.products.id
                          )}
                          className={`h-9 w-9 rounded-lg flex items-center justify-center transition-colors border ${
                            editingWeightProductId === item.products.id
                              ? 'bg-amber-500 text-white border-amber-600'
                              : item.products.average_weight
                                ? 'bg-amber-100 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-200 dark:hover:bg-amber-950/50'
                                : 'bg-gray-50 dark:bg-gray-950/30 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-950/50'
                          }`}
                          title={item.products.average_weight ? `Peso médio: ${item.products.average_weight}kg` : "Configurar peso médio"}
                        >
                          <Scale className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => setEditingItem({ 
                            id: item.id, 
                            name: item.products.name, 
                            quantity: item.quantity, 
                            price: item.products.price,
                            unit: item.products.unit || "un",
                            sell_by: item.products.sell_by || (item.products.unit === "kg" ? "weight" : "unit"),
                            image_url: item.products.image_url
                          })}
                          className="h-9 w-9 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 rounded-lg flex items-center justify-center hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors border border-blue-200 dark:border-blue-800"
                          title="Editar item"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => {
                            if (window.confirm(`Remover ${item.products.name} da cesta?`)) {
                              removeItemMutation.mutate(item.id);
                            }
                          }}
                          disabled={removeItemMutation.isPending}
                          className="h-9 w-9 bg-red-50 dark:bg-red-950/30 text-red-500 dark:text-red-400 rounded-lg flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors border border-red-200 dark:border-red-800"
                          title="Excluir item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {/* Configurações de Peso Médio */}
                  {editingWeightProductId === item.products.id && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <ProductWeightSettings
                        productId={item.products.id}
                        productName={item.products.name}
                        pricePerKg={item.products.price_per_kg || item.products.price}
                        currentAverageWeight={item.products.average_weight}
                        currentWeightVariance={item.products.weight_variance}
                        onClose={() => setEditingWeightProductId(null)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* Todos os Produtos da Loja */}
        <div className="bg-card p-5 rounded-2xl shadow-sm border border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" /> Todos os Produtos da Loja
            </h2>
            <button
              onClick={() => setShowAllProducts(!showAllProducts)}
              className="text-xs font-bold text-primary hover:underline"
            >
              {showAllProducts ? "Ocultar" : "Mostrar Todos"}
            </button>
          </div>

          {showAllProducts && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={productFilter}
                  onChange={(e) => setProductFilter(e.target.value)}
                  placeholder="Buscar produto..."
                  className="w-full h-10 pl-9 pr-3 border border-border rounded-lg text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              {isStoreProductsLoading && (
                <div className="text-center py-4">
                  <Loader2 className="h-6 w-6 text-primary animate-spin mx-auto" />
                  <p className="text-xs text-muted-foreground mt-2">Carregando produtos...</p>
                </div>
              )}

              {!isStoreProductsLoading && allProducts.length === 0 && (
                <p className="text-center text-sm py-4 text-muted-foreground">
                  Nenhum produto cadastrado na loja ainda.
                </p>
              )}

              {!isStoreProductsLoading && allProducts.length > 0 && filteredProducts.length === 0 && (
                <p className="text-center text-sm py-4 text-muted-foreground">
                  Nenhum produto encontrado para esse filtro.
                </p>
              )}

              {!isStoreProductsLoading && allProducts.length > 0 && (
                <div className="space-y-2">
                  {filteredProducts.map((product: any) => {
                    const isEditingThisProduct = editingProduct?.id === product.id;
                    const inBasket = basket.items.some((item: any) => item.products.id === product.id);

                    return (
                      <div key={product.id} className={`bg-card border border-border rounded-lg p-2 transition-all ${isEditingThisProduct ? 'ring-2 ring-primary/30 border-primary/50' : ''}`}>
                        {isEditingThisProduct ? (
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              <div className="col-span-2 sm:col-span-3">
                                <label className="text-xs font-bold text-muted-foreground">Nome</label>
                                <input 
                                  type="text" 
                                  value={editingProduct.name} 
                                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                                  className="w-full h-9 px-3 border border-border rounded-lg text-sm bg-card text-foreground"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-bold text-muted-foreground">Medida</label>
                                <select 
                                  value={editingProduct.unit} 
                                  onChange={(e) => {
                                    const nextUnit = e.target.value;
                                    setEditingProduct({
                                      ...editingProduct,
                                      unit: nextUnit,
                                      sell_by: nextUnit === "un" ? "unit" : resolveSellBy(nextUnit, editingProduct.sell_by),
                                    });
                                  }}
                                  className="w-full h-9 px-3 border border-border rounded-lg text-sm bg-card text-foreground"
                                >
                                  <option value="un">UN</option>
                                  <option value="kg">KG</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-xs font-bold text-muted-foreground">Forma de venda</label>
                                <select
                                  value={editingProduct.unit === "un" ? "unit" : (editingProduct.sell_by || "weight")}
                                  onChange={(e) => setEditingProduct({ ...editingProduct, sell_by: e.target.value })}
                                  disabled={editingProduct.unit === "un"}
                                  className="w-full h-9 px-3 border border-border rounded-lg text-sm bg-card text-foreground disabled:opacity-60"
                                >
                                  <option value="unit">Somente unidade</option>
                                  <option value="weight">Somente peso</option>
                                  <option value="both">Unidade e peso</option>
                                </select>
                              </div>
                              <div className="col-span-1 sm:col-span-1">
                                <label className="text-xs font-bold text-muted-foreground">Preço (R$)</label>
                                <input 
                                  type="number" 
                                  step="0.01"
                                  value={editingProduct.price} 
                                  onChange={(e) => setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) || 0 })}
                                  className="w-full h-9 px-3 border border-border rounded-lg text-sm bg-card text-foreground"
                                />
                              </div>
                              <div className="col-span-2 sm:col-span-3 flex items-center gap-2">
                                <div className="h-9 w-9 shrink-0 bg-muted border border-border rounded-lg flex items-center justify-center overflow-hidden">
                                  {editingProduct.image_file ? (
                                    <img src={URL.createObjectURL(editingProduct.image_file)} alt="" className="w-full h-full object-cover" />
                                  ) : editingProduct.image_url ? (
                                    <img src={editingProduct.image_url} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-xs">🖼️</span>
                                  )}
                                </div>
                                <div className="flex-1">
                                  <label className="text-xs font-bold text-muted-foreground">Link da Foto (Internet)</label>
                                  <input 
                                    type="text" 
                                    value={editingProduct.image_url || ""} 
                                    onChange={(e) => setEditingProduct({ ...editingProduct, image_url: e.target.value })}
                                    className="w-full h-9 px-3 border border-border rounded-lg text-sm bg-card text-foreground"
                                    placeholder="https://..."
                                  />
                                </div>
                              </div>
                              <div className="col-span-2 sm:col-span-3">
                                <label className="text-xs font-bold text-muted-foreground">Upload de foto (galeria/câmera)</label>
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  onChange={(e) => setEditingProduct({ ...editingProduct, image_file: e.target.files?.[0] || null })}
                                  className="w-full h-9 px-3 py-1 border border-border rounded-lg text-xs bg-card text-foreground file:mr-2 file:rounded-md file:border-0 file:bg-primary/10 file:px-2 file:py-1 file:text-primary file:font-semibold"
                                />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => setEditingProduct(null)}
                                className="flex-1 h-9 rounded-lg border border-border text-sm font-bold text-muted-foreground hover:bg-muted"
                              >
                                Cancelar
                              </button>
                              <button 
                                onClick={() => editProductMutation.mutate({
                                  productId: product.id,
                                  name: editingProduct.name,
                                  price: editingProduct.price,
                                  unit: editingProduct.unit,
                                  sellBy: editingProduct.sell_by,
                                  image_url: editingProduct.image_url,
                                  image_file: editingProduct.image_file
                                })}
                                disabled={editProductMutation.isPending}
                                className="flex-1 h-9 rounded-lg bg-primary text-white text-sm font-bold flex items-center justify-center gap-1 hover:bg-primary/90"
                              >
                                {editProductMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <label className="h-8 w-8 shrink-0 bg-muted rounded-lg flex items-center justify-center overflow-hidden cursor-pointer relative group" title="Alterar foto (galeria/câmera)">
                              {product.image_url ? (
                                <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-sm">🥬</span>
                              )}
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Plus className="h-3 w-3 text-white" />
                              </div>
                              <input
                                type="file"
                                className="hidden"
                                accept="image/*"
                                capture="environment"
                                onChange={(e) => {
                                  if (e.target.files?.[0]) {
                                    toast.loading("Enviando foto...", { id: `up-prod-${product.id}` });
                                    uploadImageMutation.mutate(
                                      { productId: product.id, file: e.target.files[0] },
                                      {
                                        onSuccess: () => toast.success("Foto atualizada!", { id: `up-prod-${product.id}` }),
                                        onError: () => toast.error("Erro no envio", { id: `up-prod-${product.id}` }),
                                      }
                                    );
                                  }
                                }}
                              />
                            </label>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-xs text-foreground truncate">{product.name}</p>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-[10px] text-muted-foreground">
                                  R$ {product.price?.toFixed(2)} / {product.unit}
                                </p>
                                <button
                                  onClick={() => toggleStockMutation.mutate({ productId: product.id, inStock: !product.in_stock })}
                                  className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md transition-colors ${
                                    product.in_stock ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-red-100 text-red-700 hover:bg-red-200"
                                  }`}
                                >
                                  {product.in_stock ? "Disponível" : "Indisponível"}
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => setEditingProduct({ 
                                  id: product.id, 
                                  name: product.name, 
                                  price: product.price,
                                  unit: product.unit || "un",
                                  sell_by: product.sell_by || (product.unit === "kg" ? "weight" : "unit"),
                                  image_url: product.image_url
                                })}
                                className="h-7 w-7 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 rounded-lg flex items-center justify-center hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors border border-blue-200 dark:border-blue-800"
                                title="Editar produto"
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => {
                                  if (window.confirm(`Excluir ${product.name} permanentemente?`)) {
                                    deleteProductMutation.mutate(product.id);
                                  }
                                }}
                                disabled={deleteProductMutation.isPending}
                                className="h-7 w-7 bg-red-50 dark:bg-red-950/30 text-red-500 dark:text-red-400 rounded-lg flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors border border-red-200 dark:border-red-800"
                                title="Excluir produto"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
