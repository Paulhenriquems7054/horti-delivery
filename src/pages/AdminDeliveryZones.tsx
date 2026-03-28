import { useState } from "react";
import { useDeliveryZones, useManageDeliveryZone } from "@/hooks/useDeliveryZones";
import { useStores } from "@/hooks/useStores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, MapPin, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function AdminDeliveryZones() {
  const navigate = useNavigate();
  const { data: stores } = useStores();
  const [selectedStore, setSelectedStore] = useState<string>();
  const { data: zones, isLoading } = useDeliveryZones(selectedStore);
  const manageZone = useManageDeliveryZone();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    fee: "",
    min_order: "",
    active: true,
    store_id: "",
  });

  const resetForm = () => {
    setForm({ name: "", fee: "", min_order: "", active: true, store_id: "" });
    setEditId(null);
  };

  const openNew = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (zone: any) => {
    setEditId(zone.id);
    setForm({
      name: zone.name,
      fee: String(zone.fee),
      min_order: String(zone.min_order || ""),
      active: zone.active,
      store_id: zone.store_id,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.store_id) {
      toast.error("Preencha nome e selecione a loja");
      return;
    }
    try {
      const payload = {
        name: form.name,
        fee: Number(form.fee) || 0,
        min_order: Number(form.min_order) || 0,
        active: form.active,
        store_id: form.store_id,
      };

      if (editId) {
        await manageZone.mutateAsync({ action: "update", id: editId, ...payload });
        toast.success("Zona atualizada!");
      } else {
        await manageZone.mutateAsync({ action: "create", ...payload });
        toast.success("Zona criada!");
      }
      setOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar zona");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta zona de entrega?")) return;
    try {
      await manageZone.mutateAsync({ action: "delete", id });
      toast.success("Zona excluída!");
    } catch {
      toast.error("Erro ao excluir zona");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="gradient-hero px-4 py-5 shadow-md">
        <div className="mx-auto max-w-2xl flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} className="text-white hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <MapPin className="h-6 w-6 text-white" />
          <h1 className="text-lg font-extrabold text-white">Zonas de Entrega</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <div className="flex items-center justify-between mb-4 gap-3">
          <Select value={selectedStore} onValueChange={setSelectedStore}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Selecione a loja" />
            </SelectTrigger>
            <SelectContent>
              {stores?.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button onClick={openNew} disabled={!selectedStore}>
                <Plus className="mr-2 h-4 w-4" /> Nova Zona
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editId ? "Editar Zona" : "Nova Zona"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <Select value={form.store_id} onValueChange={(v) => setForm((f) => ({ ...f, store_id: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a loja" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Nome da zona (ex: Centro)"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
                <Input
                  placeholder="Taxa de entrega (R$)"
                  type="number"
                  step="0.01"
                  value={form.fee}
                  onChange={(e) => setForm((f) => ({ ...f, fee: e.target.value }))}
                />
                <Input
                  placeholder="Pedido mínimo (R$)"
                  type="number"
                  step="0.01"
                  value={form.min_order}
                  onChange={(e) => setForm((f) => ({ ...f, min_order: e.target.value }))}
                />
                <div className="flex items-center gap-2">
                  <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
                  <span className="text-sm text-muted-foreground">Zona ativa</span>
                </div>
                <Button onClick={handleSave} className="w-full" disabled={manageZone.isPending}>
                  {editId ? "Salvar" : "Criar"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {!selectedStore && (
          <div className="text-center py-12">
            <MapPin className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">Selecione uma loja para ver as zonas de entrega</p>
          </div>
        )}

        {isLoading && selectedStore && <p className="text-muted-foreground animate-pulse">Carregando...</p>}

        {selectedStore && !isLoading && (
          <div className="space-y-3">
            {zones?.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Nenhuma zona cadastrada</p>
              </div>
            )}
            {zones?.map((zone) => (
              <div key={zone.id} className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <MapPin className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-card-foreground">{zone.name}</h3>
                      {zone.active ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Ativa</span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">Inativa</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Taxa: R$ {zone.fee.toFixed(2)} • Pedido mín: R$ {zone.min_order.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(zone)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(zone.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
