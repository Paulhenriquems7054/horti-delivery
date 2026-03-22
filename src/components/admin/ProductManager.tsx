import { useState } from "react";
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@/hooks/useProducts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function ProductManager() {
  const { data: products, isLoading } = useProducts();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", price: "", image_url: "", active: true });

  const resetForm = () => {
    setForm({ name: "", price: "", image_url: "", active: true });
    setEditId(null);
  };

  const openNew = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (p: any) => {
    setEditId(p.id);
    setForm({ name: p.name, price: String(p.price), image_url: p.image_url || "", active: p.active });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.price) {
      toast.error("Preencha nome e preço");
      return;
    }
    try {
      if (editId) {
        await updateProduct.mutateAsync({
          id: editId,
          name: form.name,
          price: Number(form.price),
          image_url: form.image_url || null,
          active: form.active,
        });
        toast.success("Produto atualizado!");
      } else {
        await createProduct.mutateAsync({
          name: form.name,
          price: Number(form.price),
          image_url: form.image_url || null,
          active: form.active,
        });
        toast.success("Produto criado!");
      }
      setOpen(false);
      resetForm();
    } catch {
      toast.error("Erro ao salvar produto");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este produto?")) return;
    try {
      await deleteProduct.mutateAsync(id);
      toast.success("Produto excluído!");
    } catch {
      toast.error("Erro ao excluir. O produto pode estar em uso.");
    }
  };

  if (isLoading) return <p className="text-muted-foreground animate-pulse">Carregando produtos...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-extrabold text-foreground">Produtos ({products?.length || 0})</h2>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openNew}>
              <Plus className="mr-1 h-4 w-4" /> Novo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? "Editar Produto" : "Novo Produto"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <Input
                placeholder="Nome do produto"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <Input
                placeholder="Preço (ex: 3.50)"
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              />
              <Input
                placeholder="URL da imagem (opcional)"
                value={form.image_url}
                onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
              />
              <div className="flex items-center gap-2">
                <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
                <span className="text-sm text-muted-foreground">Ativo</span>
              </div>
              <Button onClick={handleSave} className="w-full" disabled={createProduct.isPending || updateProduct.isPending}>
                {editId ? "Salvar" : "Criar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {products?.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <img
              src={p.image_url || "/placeholder.svg"}
              alt={p.name}
              className="h-12 w-12 rounded-lg object-cover"
            />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-card-foreground truncate">{p.name}</p>
              <p className="text-sm text-muted-foreground">
                R$ {p.price.toFixed(2).replace(".", ",")}
                {!p.active && <span className="ml-2 text-destructive">(inativo)</span>}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
