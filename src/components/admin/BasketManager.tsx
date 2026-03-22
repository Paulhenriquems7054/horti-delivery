import { useState } from "react";
import {
  useBaskets, useCreateBasket, useUpdateBasket, useDeleteBasket,
  useBasketItems, useAddBasketItem, useUpdateBasketItem, useDeleteBasketItem,
} from "@/hooks/useBaskets";
import { useProducts } from "@/hooks/useProducts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ShoppingBasket, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

export function BasketManager() {
  const { data: baskets, isLoading } = useBaskets();
  const createBasket = useCreateBasket();
  const updateBasket = useUpdateBasket();
  const deleteBasket = useDeleteBasket();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", price: "", active: false });
  const [expandedBasket, setExpandedBasket] = useState<string | null>(null);

  const resetForm = () => { setForm({ name: "", price: "", active: false }); setEditId(null); };

  const openNew = () => { resetForm(); setOpen(true); };
  const openEdit = (b: any) => {
    setEditId(b.id);
    setForm({ name: b.name, price: String(b.price), active: b.active });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.price) { toast.error("Preencha nome e preço"); return; }
    try {
      if (editId) {
        await updateBasket.mutateAsync({ id: editId, name: form.name, price: Number(form.price), active: form.active });
        toast.success("Cesta atualizada!");
      } else {
        await createBasket.mutateAsync({ name: form.name, price: Number(form.price), active: form.active });
        toast.success("Cesta criada!");
      }
      setOpen(false); resetForm();
    } catch { toast.error("Erro ao salvar cesta"); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta cesta?")) return;
    try { await deleteBasket.mutateAsync(id); toast.success("Cesta excluída!"); }
    catch { toast.error("Erro ao excluir cesta"); }
  };

  if (isLoading) return <p className="text-muted-foreground animate-pulse">Carregando cestas...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-extrabold text-foreground">Cestas ({baskets?.length || 0})</h2>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openNew}><Plus className="mr-1 h-4 w-4" /> Nova</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? "Editar Cesta" : "Nova Cesta"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <Input placeholder="Nome da cesta" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <Input placeholder="Preço total" type="number" step="0.01" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
              <div className="flex items-center gap-2">
                <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
                <span className="text-sm text-muted-foreground">Ativa (visível para clientes)</span>
              </div>
              <Button onClick={handleSave} className="w-full" disabled={createBasket.isPending || updateBasket.isPending}>
                {editId ? "Salvar" : "Criar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {baskets?.map((b) => (
          <div key={b.id} className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 p-3">
              <ShoppingBasket className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-card-foreground truncate">{b.name}</p>
                <p className="text-sm text-muted-foreground">
                  R$ {b.price.toFixed(2).replace(".", ",")}
                  {b.active ? <span className="ml-2 text-primary font-semibold">(ativa)</span> : <span className="ml-2 text-destructive">(inativa)</span>}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setExpandedBasket(expandedBasket === b.id ? null : b.id)}>
                {expandedBasket === b.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => openEdit(b)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(b.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            {expandedBasket === b.id && <BasketItemsPanel basketId={b.id} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function BasketItemsPanel({ basketId }: { basketId: string }) {
  const { data: items, isLoading } = useBasketItems(basketId);
  const { data: products } = useProducts();
  const addItem = useAddBasketItem();
  const updateItem = useUpdateBasketItem();
  const deleteItem = useDeleteBasketItem();

  const [selectedProduct, setSelectedProduct] = useState("");
  const [qty, setQty] = useState("1");

  const handleAdd = async () => {
    if (!selectedProduct) { toast.error("Selecione um produto"); return; }
    try {
      await addItem.mutateAsync({ basket_id: basketId, product_id: selectedProduct, quantity: Number(qty) || 1 });
      toast.success("Item adicionado!");
      setSelectedProduct(""); setQty("1");
    } catch { toast.error("Erro ao adicionar item"); }
  };

  const handleUpdateQty = async (item: any, newQty: number) => {
    if (newQty < 1) return;
    try { await updateItem.mutateAsync({ id: item.id, basket_id: basketId, quantity: newQty }); }
    catch { toast.error("Erro ao atualizar quantidade"); }
  };

  const handleRemove = async (item: any) => {
    try { await deleteItem.mutateAsync({ id: item.id, basket_id: basketId }); toast.success("Item removido!"); }
    catch { toast.error("Erro ao remover item"); }
  };

  const availableProducts = products?.filter(
    (p) => !items?.some((i) => i.product_id === p.id)
  );

  return (
    <div className="border-t bg-muted/30 p-3 space-y-3">
      <p className="text-sm font-semibold text-foreground">Itens da cesta</p>

      {isLoading && <p className="text-xs text-muted-foreground animate-pulse">Carregando...</p>}

      {items?.map((item) => (
        <div key={item.id} className="flex items-center gap-2 text-sm">
          <span className="flex-1 truncate text-card-foreground">{item.product_name || item.product_id}</span>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleUpdateQty(item, item.quantity - 1)}>-</Button>
          <span className="w-6 text-center font-bold">{item.quantity}</span>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleUpdateQty(item, item.quantity + 1)}>+</Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemove(item)}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      ))}

      {availableProducts && availableProducts.length > 0 && (
        <div className="flex gap-2 items-end pt-2 border-t">
          <div className="flex-1">
            <Select value={selectedProduct} onValueChange={setSelectedProduct}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Adicionar produto..." />
              </SelectTrigger>
              <SelectContent>
                {availableProducts.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} className="w-16 h-9" />
          <Button size="sm" className="h-9" onClick={handleAdd} disabled={addItem.isPending}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
