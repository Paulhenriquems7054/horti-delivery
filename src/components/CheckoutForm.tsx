import { useState, useEffect } from "react";
import { Loader2, ArrowLeft, User, Phone, MapPin, Truck, Ticket, X } from "lucide-react";
import { useDeliveryZones, type DeliveryZone } from "@/hooks/useDeliveryZones";
import { useValidateCoupon } from "@/hooks/useCoupons";
import { toast } from "sonner";

interface Props {
  loading: boolean;
  basketName: string;
  basketPrice: number;
  storeId?: string;
  onSubmit: (data: { 
    customer_name: string; 
    phone: string; 
    address: string; 
    total_with_fee: number; 
    neighborhood_id?: string;
    coupon_id?: string;
    discount?: number;
    delivery_fee?: number;
  }) => void;
  onBack: () => void;
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function CheckoutForm({ loading, basketName, basketPrice, storeId, onSubmit, onBack }: Props) {
  const { data: zones } = useDeliveryZones(storeId);
  const validateCoupon = useValidateCoupon();
  
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [reference, setReference] = useState("");
  const [selectedZone, setSelectedZone] = useState<string>("");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [touched, setTouched] = useState({
    name: false, phone: false, street: false, number: false, neighborhood: false, zone: false,
  });

  // Carregar histórico local do cliente
  useEffect(() => {
    const savedCustomer = localStorage.getItem("horti_customer_profile");
    if (savedCustomer) {
      const parsed = JSON.parse(savedCustomer);
      if (parsed.name) setName(parsed.name);
      if (parsed.phone) setPhone(parsed.phone);
      if (parsed.street) setStreet(parsed.street);
      if (parsed.number) setNumber(parsed.number);
      if (parsed.neighborhood) setNeighborhood(parsed.neighborhood);
      if (parsed.reference) setReference(parsed.reference);
      if (parsed.zone) setSelectedZone(parsed.zone);
    }
  }, []);

  const currentZoneData = zones?.find(z => z.id === selectedZone);
  const deliveryFee = currentZoneData ? currentZoneData.fee : 0;
  
  // Calculate discount
  let discount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.discount_type === "percentage") {
      discount = (basketPrice * appliedCoupon.discount_value) / 100;
    } else {
      discount = appliedCoupon.discount_value;
    }
  }
  
  const finalTotal = Math.max(0, basketPrice - discount + deliveryFee);

  const errors = {
    name: name.trim().length < 2 ? "Informe seu nome completo" : "",
    phone: phone.replace(/\D/g, "").length < 10 ? "Informe um telefone válido" : "",
    street: street.trim().length < 3 ? "Informe a rua" : "",
    number: number.trim().length < 1 ? "Informe o número" : "",
    neighborhood: neighborhood.trim().length < 2 ? "Informe o bairro" : "",
    zone: zones?.length && !selectedZone ? "Selecione seu bairro" : "",
  };

  const isValid = !errors.name && !errors.phone && !errors.street && !errors.number && !errors.neighborhood && !errors.zone;

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      toast.error("Digite um código de cupom");
      return;
    }
    try {
      const coupon = await validateCoupon.mutateAsync({
        code: couponCode,
        storeId,
        orderTotal: basketPrice,
      });
      setAppliedCoupon(coupon);
      toast.success(`Cupom aplicado! ${coupon.discount_type === "percentage" ? `${coupon.discount_value}%` : `R$ ${coupon.discount_value}`} OFF`);
    } catch (err: any) {
      toast.error(err.message || "Cupom inválido");
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
    toast.info("Cupom removido");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, phone: true, street: true, number: true, neighborhood: true, zone: true });
    
    if (!isValid) return;

    // Monta endereço completo
    const fullAddress = [
      `${street.trim()}, ${number.trim()}`,
      neighborhood.trim(),
      currentZoneData?.name,
      reference.trim() ? `Ref: ${reference.trim()}` : "",
    ].filter(Boolean).join(" - ");

    // Salvar no localStorage para a próxima compra
    localStorage.setItem("horti_customer_profile", JSON.stringify({
      name: name.trim(), phone,
      street: street.trim(), number: number.trim(),
      neighborhood: neighborhood.trim(), reference: reference.trim(),
      zone: selectedZone,
    }));

    onSubmit({
      customer_name: name.trim(),
      phone,
      address: fullAddress,
      total_with_fee: finalTotal,
      neighborhood_id: selectedZone || undefined,
      coupon_id: appliedCoupon?.id,
      discount,
      delivery_fee: deliveryFee,
    });
  };

  return (
    <div className="animate-slide-up">
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-xl font-extrabold text-foreground">Finalizar Pedido</h2>
          <p className="text-sm text-muted-foreground">{basketName}</p>
        </div>
      </div>

      <div className="rounded-2xl gradient-card border border-primary/20 p-4 mb-6 flex flex-col gap-1">
        <div className="flex justify-between text-sm font-semibold text-muted-foreground">
          <span>Subtotal:</span>
          <span>R$ {basketPrice.toFixed(2).replace(".", ",")}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-sm font-semibold text-emerald-600">
            <span>Desconto ({appliedCoupon.code}):</span>
            <span>- R$ {discount.toFixed(2).replace(".", ",")}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-semibold text-muted-foreground mb-1">
          <span>Taxa de Entrega:</span>
          <span>+ R$ {deliveryFee.toFixed(2).replace(".", ",")}</span>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-primary/20">
          <span className="text-base font-bold text-foreground">Total do pedido</span>
          <span className="text-2xl font-extrabold text-primary">
            R$ {finalTotal.toFixed(2).replace(".", ",")}
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Cupom de Desconto */}
        <div className="space-y-1">
          <label className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <Ticket className="h-4 w-4 text-primary" /> Cupom de Desconto (opcional)
          </label>
          {appliedCoupon ? (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <Ticket className="h-5 w-5 text-emerald-600" />
              <div className="flex-1">
                <p className="text-sm font-bold text-emerald-700">{appliedCoupon.code}</p>
                <p className="text-xs text-emerald-600">
                  {appliedCoupon.discount_type === "percentage" 
                    ? `${appliedCoupon.discount_value}% OFF` 
                    : `R$ ${appliedCoupon.discount_value.toFixed(2)} OFF`}
                </p>
              </div>
              <button
                type="button"
                onClick={handleRemoveCoupon}
                className="h-8 w-8 rounded-lg bg-emerald-100 hover:bg-emerald-200 flex items-center justify-center"
              >
                <X className="h-4 w-4 text-emerald-700" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Digite o código"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                className="flex-1 h-12 rounded-xl border border-border px-4 text-base font-semibold bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                type="button"
                onClick={handleApplyCoupon}
                disabled={validateCoupon.isPending}
                className="h-12 px-6 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 disabled:opacity-50"
              >
                {validateCoupon.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aplicar"}
              </button>
            </div>
          )}
        </div>

        {/* Campo Nome */}
        <div className="space-y-1">
          <label className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <User className="h-4 w-4 text-primary" /> Nome completo
          </label>
          <input
            type="text"
            placeholder="Ex: Maria da Silva"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, name: true }))}
            className={`w-full h-12 rounded-xl border px-4 text-base font-semibold bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${touched.name && errors.name ? "border-destructive ring-1 ring-destructive/30" : "border-border"}`}
          />
        </div>

        {/* Campo Telefone */}
        <div className="space-y-1">
          <label className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <Phone className="h-4 w-4 text-primary" /> WhatsApp
          </label>
          <input
            type="tel"
            placeholder="(00) 00000-0000"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
            className={`w-full h-12 rounded-xl border px-4 text-base font-semibold bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${touched.phone && errors.phone ? "border-destructive ring-1 ring-destructive/30" : "border-border"}`}
          />
        </div>

        {/* Campo Bairro (Dinâmico) */}
        {zones && zones.length > 0 && (
          <div className="space-y-1">
            <label className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <Truck className="h-4 w-4 text-primary" /> Bairro / Taxa de Entrega
            </label>
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, zone: true }))}
              className={`w-full h-12 rounded-xl border px-4 text-base font-semibold bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${touched.zone && errors.zone ? "border-destructive ring-1 ring-destructive/30" : "border-border"}`}
            >
              <option value="" disabled>Selecione seu bairro...</option>
              {zones.map(z => (
                <option key={z.id} value={z.id}>
                  {z.name} - R$ {z.fee.toFixed(2).replace(".", ",")}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Campos de Endereço */}
        <div className="space-y-1">
          <label className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-primary" /> Endereço de Entrega
          </label>
          <div className="space-y-2">
            {/* Rua */}
            <input
              type="text"
              placeholder="Rua / Avenida / Travessa"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, street: true }))}
              className={`w-full h-12 rounded-xl border px-4 text-base font-semibold bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${touched.street && errors.street ? "border-destructive ring-1 ring-destructive/30" : "border-border"}`}
            />
            {/* Número + Bairro */}
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Número"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, number: true }))}
                className={`h-12 rounded-xl border px-4 text-base font-semibold bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${touched.number && errors.number ? "border-destructive ring-1 ring-destructive/30" : "border-border"}`}
              />
              <input
                type="text"
                placeholder="Bairro"
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, neighborhood: true }))}
                className={`h-12 rounded-xl border px-4 text-base font-semibold bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${touched.neighborhood && errors.neighborhood ? "border-destructive ring-1 ring-destructive/30" : "border-border"}`}
              />
            </div>
            {/* Ponto de Referência */}
            <input
              type="text"
              placeholder="Ponto de referência (opcional) — Ex: Próximo ao mercado"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full h-12 rounded-xl border border-border px-4 text-base font-semibold bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
          </div>
        </div>

        {/* Botão submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full h-14 rounded-2xl gradient-hero text-white text-lg font-extrabold shadow-button flex items-center justify-center gap-2 transition-opacity active:opacity-90 disabled:opacity-60 mt-4"
        >
          {loading ? (
             <Loader2 className="h-5 w-5 animate-spin-slow" />
          ) : (
            "✅ Confirmar Pedido"
          )}
        </button>
      </form>
    </div>
  );
}
