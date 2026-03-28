import { useState } from "react";
import { useStores, useCreateStore, useUpdateStore, useDeleteStore } from "@/hooks/useStores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Store, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function AdminStores() {
  const navigate = useNavigate();
  const { data: stores, isLoading } = useStores();
  const createStore = useCreateStore();
  const updateStore = useUpdateStore();
  const deleteStore = useDeleteStore();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    logo_url: "",
    phone: "",
    email: "",
    address: "",
    active: true,
  });

  const resetForm = () => {
    setForm({ name: "", slug: "", description: "", logo_url: "", phone: "", email: "", address: "", active: true });
    setEditId(null);
  };

  const openNew = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (store: any) => {
    setEditId(store.id);
    setForm({
      name: store.name,
      slug: store.slug,
      description: store.description || "",
      logo_url: store.logo_url || "",
      phone: store.phone || "",
      email: store.email || "",
      address: store.address || "",
      active: store.active,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.slug) {
      toast.error("Preencha nome e slug");
      return;
    }
    try {
      if (editId) {
        await updateStore.mutateAsync({ id: editId, ...form });
        toast.success("Loja atualizada!");
      } else {
        await createStore.mutateAsync(form);
        toast.success("Loja criada!");
      }
      setOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar loja");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta loja?")) return;
    try {
      await deleteStore.mutateAsync(id);
      toast.success("Loja excluída!");
    } catch {
      toast.error("Erro ao excluir loja");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="gradient-hero px-4 py-5 shadow-md">
        <div className="mx-auto max-w-2xl flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} className="text-white hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Store className="h-6 w-6 text-white" />
          <h1 className="text-lg font-extrabold text-white">Gerenciar Lojas</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">Total: {stores?.length || 0} lojas</p>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button onClick={openNew}>
                <Plus className="mr-2 h-4 w-4" /> Nova Loja
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editId ? "Editar Loja" : "Nova Loja"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <Input
                  placeholder="Nome da loja"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
                <Input
                  placeholder="Slug (URL amigável, ex: minha-loja)"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))}
                />
                <Textarea
                  placeholder="Descrição"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
                <Input
                  placeholder="URL do logo"
                  value={form.logo_url}
                  onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))}
                />
                <Input
                  placeholder="Telefone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
                <Input
                  placeholder="Email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
                <Textarea
                  placeholder="Endereço"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
                <div className="flex items-center gap-2">
                  <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
                  <span className="text-sm text-muted-foreground">Loja ativa</span>
                </div>
                <Button onClick={handleSave} className="w-full" disabled={createStore.isPending || updateStore.isPending}>
                  {editId ? "Salvar" : "Criar"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading && <p className="text-muted-foreground animate-pulse">Carregando...</p>}

        <div className="space-y-3">
          {stores?.map((store) => (
            <div key={store.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-start gap-3">
                {store.logo_url ? (
                  <img src={store.logo_url} alt={store.name} className="h-12 w-12 rounded-lg object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Store className="h-6 w-6 text-primary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-card-foreground">{store.name}</h3>
                    {store.active ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Ativa</span>
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">Inativa</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">/{store.slug}</p>
                  {store.description && <p className="text-sm text-muted-foreground mt-1">{store.description}</p>}
                  {store.phone && <p className="text-xs text-muted-foreground mt-1">📞 {store.phone}</p>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(store)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(store.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
