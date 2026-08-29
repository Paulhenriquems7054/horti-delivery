import { useState, useEffect } from "react";
import { useMyStore, useUpdateStore, useDeleteStore, Store } from "@/hooks/useStores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Pencil, Trash2, Store as StoreIcon, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AccountSecurity } from "@/components/admin/AccountSecurity";
import { StoreLogo } from "@/components/StoreLogo";
import { StoreLogoUpload } from "@/components/StoreLogoUpload";
import { useTenant } from "@/contexts/TenantContext";

export default function AdminStores() {
  const navigate = useNavigate();

  useEffect(() => {
    if (window.location.hash === "#minha-conta") {
      document.getElementById("minha-conta")?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);
  const { data: myStore, isLoading, refetch } = useMyStore();
  const { refresh: refreshTenant } = useTenant();
  const updateStore = useUpdateStore();
  const deleteStore = useDeleteStore();

  const stores: Store[] = myStore ? [myStore] : [];

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [newDeliveryPin, setNewDeliveryPin] = useState("");
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
    setNewDeliveryPin("");
    setEditId(null);
  };

  const openEdit = (store: Store) => {
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
    setNewDeliveryPin("");
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.slug) {
      toast.error("Preencha nome e slug");
      return;
    }
    if (!editId) {
      toast.error("Novas lojas são criadas pelo administrador da plataforma.");
      return;
    }
    try {
      if (newDeliveryPin.trim()) {
        if (newDeliveryPin.length < 6 || newDeliveryPin.length > 8 || !/^\d+$/.test(newDeliveryPin)) {
          toast.error("PIN do entregador: use 6 a 8 dígitos numéricos");
          return;
        }
        const { error: pinErr } = await supabase.rpc("update_store_delivery_pin" as never, {
          p_pin: newDeliveryPin,
        } as never);
        if (pinErr) throw pinErr;
      }

      await updateStore.mutateAsync({ id: editId, ...form });

      toast.success("Loja atualizada!");
      setOpen(false);
      resetForm();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao salvar loja";
      toast.error(message);
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
          <StoreIcon className="h-6 w-6 text-white" />
          <h1 className="text-lg font-extrabold text-white">Gerenciar Lojas</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            {myStore ? "Sua loja" : "Sua loja será provisionada pelo administrador da plataforma"}
          </p>
        </div>

        {!myStore && !isLoading && (
          <div className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground mb-4">
            O cadastro de novas lojas é feito exclusivamente pelo Super Admin. Entre em contato com o suporte da plataforma se ainda não possui uma loja.
          </div>
        )}

        {isLoading && <p className="text-muted-foreground animate-pulse">Carregando...</p>}

        {myStore && (
          <StoreLogoUpload
            storeId={myStore.id}
            storeName={myStore.name}
            logoPath={myStore.logo_path}
            logoVersion={myStore.updated_at}
            onUpdated={() => {
              void refetch();
              refreshTenant();
            }}
          />
        )}

        <div className="space-y-3 mt-4">
          {stores?.map((store) => (
            <div key={store.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <StoreLogo
                  logoPath={store.logo_path}
                  logoVersion={store.updated_at}
                  alt={store.name}
                  className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden p-1 shrink-0"
                />
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
                  <p className="text-xs text-muted-foreground mt-1">
                    🛵 Entregador:{" "}
                    <a
                      href={`/${store.slug}/delivery`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary font-mono hover:underline"
                    >
                      /{store.slug}/delivery
                    </a>
                    {" "}• PIN: configurado no painel (não exibido por segurança)
                  </p>
                </div>
                <div className="flex gap-1">
                  <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(store)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Editar Loja</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3 mt-2">
                        <Input placeholder="Nome da loja" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                        <Input placeholder="Slug" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))} />
                        <Textarea placeholder="Descrição" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                        <Input placeholder="Telefone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
                        <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                        <Textarea placeholder="Endereço" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
                        <div className="flex items-center gap-2">
                          <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
                          <span className="text-sm text-muted-foreground">Loja ativa</span>
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-bold text-foreground">Novo PIN do entregador (opcional)</label>
                          <Input
                            placeholder="6–8 dígitos"
                            maxLength={8}
                            value={newDeliveryPin}
                            onChange={(e) => setNewDeliveryPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                          />
                        </div>
                        <Button onClick={handleSave} className="w-full" disabled={updateStore.isPending}>
                          Salvar
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(store.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <AccountSecurity />
      </main>
    </div>
  );
}
