import { useState } from "react";
import { useCoupons, useCreateCoupon, useUpdateCoupon, useDeleteCoupon } from "@/hooks/useCoupons";
import { useStores } from "@/hooks/useStores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Ticket, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function AdminCoupons() {
  const navigate = useNavigate();
  const { data: stores } = useStores();
  const [selectedStore, setSelectedStore] = useState<string>();
  const { data: coupons, isLoading } = useCoupons(selectedStore);
  const createCoupon = useCreateCoupon();
  const updateCoupon = useUpdateCoupon();
  const deleteCoupon = useDeleteCoupon();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "",
    discount_type: "percentage" as "percentage" | "fixed",
    discount_value: "",
    min_order: "",
    max_uses: "",
    expires_at: "",
    active: true,
    store_id: "",
  });

  const resetForm = () => {
    setForm({
      code: "",
      discount_type: "percentage",
      discount_value: "",
      min_order: "",
      max_uses: "",
      expires_at: "",
      active: true,
      store_id: "",
    });
    setEditId(null);
  };

  const openNew = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (coupon: any) => {
    setEditId(coupon.id);
    setForm({
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: String(coupon.discount_value),
      min_order: String(coupon.min_order || ""),
      max_uses: String(coupon.max_uses || ""),
      expires_at: coupon.expires_at ? coupon.expires_at.split("T")[0] : "",
      active: coupon.active,
      store_id: coupon.store_id || "",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.code || !form.discount_value) {
      toast.error("Preencha código e valor do desconto");
      return;
    }
    try {
      const payload = {
        code: form.code.toUpperCase(),
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        min_order: Number(form.min_order) || 0,
        max_uses: form.max_uses ? Number(form.max_uses) : undefined,
        expires_at: form.expires_at || undefined,
        active: form.active,
        store_id: form.store_id || undefined,
      };

      if (editId) {
        await updateCoupon.mutateAsync({ id: editId, ...payload });
        toast.success("Cupom atualizado!");
      } else {
        await createCoupon.mutateAsync(payload as any);
        toast.success("Cupom criado!");
      }
      setOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar cupom");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este cupom?")) return;
    try {
      await deleteCoupon.mutateAsync(id);
      toast.success("Cupom excluído!");
    } catch {
      toast.error("Erro ao excluir cupom");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="gradient-hero px-4 py-5 shadow-md">
        <div className="mx-auto max-w-2xl flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} className="text-white hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Ticket className="h-6 w-6 text-white" />
          <h1 className="text-lg font-extrabold text-white">Gerenciar Cupons</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <div className="flex items-center justify-between mb-4 gap-3">
          <Select value={selectedStore} onValueChange={setSelectedStore}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Todas as lojas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as lojas</SelectItem>
              {stores?.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button onClick={openNew}>
                <Plus className="mr-2 h-4 w-4" /> Novo Cupom
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editId ? "Editar Cupom" : "Novo Cupom"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <Input
                  placeholder="Código (ex: PROMO10)"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                />
                <Select value={form.discount_type} onValueChange={(v: any) => setForm((f) => ({ ...f, discount_type: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Porcentagem (%)</SelectItem>
                    <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder={form.discount_type === "percentage" ? "Desconto (%)" : "Desconto (R$)"}
                  type="number"
                  step="0.01"
                  value={form.discount_value}
                  onChange={(e) => setForm((f) => ({ ...f, discount_value: e.target.value }))}
                />
                <Input
                  placeholder="Pedido mínimo (R$)"
                  type="number"
                  step="0.01"
                  value={form.min_order}
                  onChange={(e) => setForm((f) => ({ ...f, min_order: e.target.value }))}
                />
                <Input
                  placeholder="Máximo de usos (opcional)"
                  type="number"
                  value={form.max_uses}
                  onChange={(e) => setForm((f) => ({ ...f, max_uses: e.target.value }))}
                />
                <Input
                  placeholder="Data de expiração"
                  type="date"
                  value={form.expires_at}
                  onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
                />
                <Select value={form.store_id} onValueChange={(v) => setForm((f) => ({ ...f, store_id: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Loja (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todas as lojas</SelectItem>
                    {stores?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
                  <span className="text-sm text-muted-foreground">Cupom ativo</span>
                </div>
                <Button onClick={handleSave} className="w-full" disabled={createCoupon.isPending || updateCoupon.isPending}>
                  {editId ? "Salvar" : "Criar"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading && <p className="text-muted-foreground animate-pulse">Carregando...</p>}

        <div className="space-y-3">
          {coupons?.map((coupon) => (
            <div key={coupon.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Ticket className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-card-foreground">{coupon.code}</h3>
                    {coupon.active ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Ativo</span>
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">Inativo</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {coupon.discount_type === "percentage" ? `${coupon.discount_value}% OFF` : `R$ ${coupon.discount_value.toFixed(2)} OFF`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Pedido mín: R$ {coupon.min_order.toFixed(2)} • Usado: {coupon.used_count}
                    {coupon.max_uses && `/${coupon.max_uses}`}
                  </p>
                  {coupon.expires_at && (
                    <p className="text-xs text-muted-foreground">Expira: {new Date(coupon.expires_at).toLocaleDateString()}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(coupon)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(coupon.id)}>
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
