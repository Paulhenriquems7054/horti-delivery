import { useState, useEffect, useRef } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { Loader2, ArrowLeft, User, Phone, MapPin, Truck, Ticket, X, CreditCard, Banknote, Wallet, Scale, QrCode } from "lucide-react";
import { paymentLabel } from "@/lib/paymentMethods";
import { useDeliveryZones } from "@/hooks/useDeliveryZones";
import { useValidateCoupon } from "@/hooks/useCoupons";
import { toast } from "sonner";
import { CartEstimateWarning } from "@/components/CartEstimateWarning";
import {
  clearLegacyCustomerProfile,
  getCheckoutAddress,
  getCustomerName,
  getLastOrderPhone,
  saveCheckoutAddress,
  saveCustomerName,
  saveLastOrderPhone,
} from "@/lib/customerSession";
import type { StoreOperationalSettings } from "@/hooks/useStoreOperationalSettings";

const HCAPTCHA_SITE_KEY =
  import.meta.env.VITE_HCAPTCHA_SITE_KEY || "10000000-ffff-ffff-ffff-000000000001";
const HCAPTCHA_REQUIRED = Boolean(import.meta.env.VITE_HCAPTCHA_SITE_KEY);

interface Props {
  loading: boolean;
  basketName: string;
  basketPrice: number;
  storeId?: string;
  storeSlug?: string;
  estimatedTotal?: number;
  hasUnitItems?: boolean;
  itemsWithoutEstimate?: number;
  cartLines?: { name: string; detail: string; subtotal: number; itemNotes?: string }[];
  itemCount?: number;
  operationalSettings?: StoreOperationalSettings;
  outsideDeliveryHours?: boolean;
  onSubmit: (data: {
    customer_name: string; 
    phone: string; 
    address: string; 
    total_with_fee: number; 
    neighborhood_id?: string;
    coupon_id?: string;
    coupon_code?: string;
    discount?: number;
    delivery_fee?: number;
    payment_method: "cash" | "card" | "pix";
    notes?: string;
    email?: string;
    privacy_acknowledged: boolean;
  }) => void;
  onBack: () => void;
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function CheckoutForm({ 
  loading, 
  basketName, 
  basketPrice, 
  storeId,
  storeSlug, 
  estimatedTotal,
  hasUnitItems = false,
  itemsWithoutEstimate = 0,
  cartLines = [],
  itemCount = 0,
  operationalSettings,
  outsideDeliveryHours = false,
  onSubmit,
  onBack
}: Props) {
  const { data: zones } = useDeliveryZones(storeId);
  const validateCoupon = useValidateCoupon();
  const captchaRef = useRef<HCaptcha>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [reference, setReference] = useState("");
  const [selectedZone, setSelectedZone] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "pix">("cash");
  const [changeFor, setChangeFor] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [touched, setTouched] = useState({
    name: false, phone: false, street: false, number: false, neighborhood: false, zone: false,
  });

  useEffect(() => {
    clearLegacyCustomerProfile();
    const savedName = getCustomerName();
    const savedPhone = getLastOrderPhone();
    const savedAddress = getCheckoutAddress();
    if (savedName) setName(savedName);
    if (savedPhone) setPhone(formatPhone(savedPhone));
    if (savedAddress) {
      setStreet(savedAddress.street);
      setNumber(savedAddress.number);
      setNeighborhood(savedAddress.neighborhood);
      setReference(savedAddress.reference);
      setSelectedZone(savedAddress.zone);
    }
  }, []);

  const currentZoneData = zones?.find(z => z.id === selectedZone);
  const deliveryFee = currentZoneData ? currentZoneData.fee : 0;
  const couponValidationTotal = Math.max(basketPrice, estimatedTotal || 0);
  
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

  const isValid =
    !errors.name &&
    !errors.phone &&
    !errors.street &&
    !errors.number &&
    !errors.neighborhood &&
    !errors.zone &&
    privacyAccepted &&
    (!HCAPTCHA_REQUIRED || Boolean(captchaToken));

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      toast.error("Digite um código de cupom");
      return;
    }
    try {
      const coupon = await validateCoupon.mutateAsync({
        code: couponCode,
        storeSlug,
        storeId,
        orderTotal: couponValidationTotal,
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

    saveCustomerName(name.trim());
    saveLastOrderPhone(phone);
    saveCheckoutAddress({
      street: street.trim(),
      number: number.trim(),
      neighborhood: neighborhood.trim(),
      reference: reference.trim(),
      zone: selectedZone,
    });

    const notes = paymentMethod === "cash" && changeFor.trim()
      ? `Troco para R$ ${changeFor.trim()}`
      : undefined;

    if (!reviewing) {
      setReviewing(true);
      return;
    }

    onSubmit({
      customer_name: name.trim(),
      phone,
      address: fullAddress,
      total_with_fee: finalTotal,
      neighborhood_id: selectedZone || undefined,
    coupon_id: appliedCoupon?.id,
    coupon_code: appliedCoupon?.code,
    discount,
    delivery_fee: deliveryFee,
    payment_method: paymentMethod,
    notes,
    privacy_acknowledged: privacyAccepted,
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
        {/* Subtotal - diferencia entre confirmado e estimado */}
        <div className="flex justify-between text-sm font-semibold text-muted-foreground">
          <span className="flex items-center gap-1">
            Subtotal (confirmado):
          </span>
          <span>R$ {basketPrice.toFixed(2).replace(".", ",")}</span>
        </div>
        
        {/* Estimativa de itens por unidade */}
        {estimatedTotal && estimatedTotal > basketPrice && (
          <div className="flex justify-between text-sm font-semibold text-amber-600">
            <span className="flex items-center gap-1">
              <Scale className="h-3.5 w-3.5" />
              Estimativa (por unidade):
            </span>
            <span>+ R$ {(estimatedTotal - basketPrice).toFixed(2).replace(".", ",")}</span>
          </div>
        )}
        
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
          <div>
            <span className="text-base font-bold text-foreground">
              {hasUnitItems ? "Total estimado" : "Total do pedido"}
            </span>
            {hasUnitItems && (
              <p className="text-[10px] text-muted-foreground">
                Valor final após pesagem
              </p>
            )}
          </div>
          <span className="text-2xl font-extrabold text-primary">
            R$ {(estimatedTotal ? Math.max(0, estimatedTotal - discount + deliveryFee) : finalTotal).toFixed(2).replace(".", ",")}
          </span>
        </div>
        
        {/* Aviso de variação para itens por unidade */}
        {hasUnitItems && (
          <div className="mt-3">
            <CartEstimateWarning 
              hasUnitItems={true}
              itemsWithoutEstimate={itemsWithoutEstimate}
              variant="warning"
            />
          </div>
        )}
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
                className="flex-1 h-12 rounded-xl border border-border px-4 text-base font-semibold bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
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
            className={`w-full h-12 rounded-xl border px-4 text-base font-semibold bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${touched.name && errors.name ? "border-destructive ring-1 ring-destructive/30" : "border-border"}`}
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
            className={`w-full h-12 rounded-xl border px-4 text-base font-semibold bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${touched.phone && errors.phone ? "border-destructive ring-1 ring-destructive/30" : "border-border"}`}
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
              className={`w-full h-12 rounded-xl border px-4 text-base font-semibold bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${touched.zone && errors.zone ? "border-destructive ring-1 ring-destructive/30" : "border-border"}`}
            >
              <option value="" disabled>Selecione seu bairro...</option>
              {zones.map(z => (
                <option key={z.id} value={z.id}>
                  {(z.name || z.neighborhood || "Bairro sem nome")} - R$ {z.fee.toFixed(2).replace(".", ",")}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Forma de Pagamento */}
        <div className="space-y-2">
          <label className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <Wallet className="h-4 w-4 text-primary" /> Pagamento
          </label>
          <p className="text-sm font-medium text-foreground">Escolha como deseja pagar.</p>
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
            O pagamento será realizado somente no momento da entrega.
          </p>
          {operationalSettings?.return_policy_text && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              ⚠️ {operationalSettings.return_policy_text}
            </p>
          )}
          {operationalSettings?.deliveryHoursMessage && (
            <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              {operationalSettings.deliveryHoursMessage}
            </p>
          )}
          {outsideDeliveryHours && operationalSettings?.outsideHoursMessage && (
            <p className="text-sm text-amber-900 bg-amber-100 border border-amber-300 rounded-xl px-3 py-2">
              {operationalSettings.outsideHoursMessage}
            </p>
          )}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setPaymentMethod("cash")}
              className={`h-20 rounded-xl border-2 flex flex-col items-center justify-center gap-1.5 transition-all ${
                paymentMethod === "cash"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/50"
              }`}
            >
              <Banknote className="h-6 w-6" />
              <span className="text-xs font-bold">Dinheiro</span>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("card")}
              className={`h-20 rounded-xl border-2 flex flex-col items-center justify-center gap-1.5 transition-all ${
                paymentMethod === "card"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/50"
              }`}
            >
              <CreditCard className="h-6 w-6" />
              <span className="text-xs font-bold">Cartão</span>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("pix")}
              className={`h-20 rounded-xl border-2 flex flex-col items-center justify-center gap-1.5 transition-all ${
                paymentMethod === "pix"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/50"
              }`}
            >
              <QrCode className="h-6 w-6" />
              <span className="text-xs font-bold">PIX</span>
            </button>
          </div>
          {paymentMethod === "cash" && (
            <input
              type="text"
              inputMode="decimal"
              placeholder="Precisa de troco? Informe para quanto"
              value={changeFor}
              onChange={(e) => setChangeFor(e.target.value)}
              className="w-full h-12 rounded-xl border border-border px-4 text-sm font-semibold bg-card"
            />
          )}
        </div>

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
              className={`w-full h-12 rounded-xl border px-4 text-base font-semibold bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${touched.street && errors.street ? "border-destructive ring-1 ring-destructive/30" : "border-border"}`}
            />
            {/* Número + Bairro */}
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Número"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, number: true }))}
                className={`h-12 rounded-xl border px-4 text-base font-semibold bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${touched.number && errors.number ? "border-destructive ring-1 ring-destructive/30" : "border-border"}`}
              />
              <input
                type="text"
                placeholder="Bairro"
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, neighborhood: true }))}
                className={`h-12 rounded-xl border px-4 text-base font-semibold bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${touched.neighborhood && errors.neighborhood ? "border-destructive ring-1 ring-destructive/30" : "border-border"}`}
              />
            </div>
            {/* Ponto de Referência */}
            <input
              type="text"
              placeholder="Ponto de referência (opcional) — Ex: Próximo ao mercado"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full h-12 rounded-xl border border-border px-4 text-base font-semibold bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
          </div>
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4 cursor-pointer">
          <input
            type="checkbox"
            checked={privacyAccepted}
            onChange={(e) => setPrivacyAccepted(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-border"
          />
          <span className="text-sm text-foreground leading-snug">
            Li e concordo com o tratamento dos meus dados (nome, telefone e endereço) para processar
            este pedido e entrega, conforme a LGPD. Os dados são usados apenas pela loja responsável.
          </span>
        </label>

        {HCAPTCHA_REQUIRED && (
          <div className="flex justify-center">
            <HCaptcha
              ref={captchaRef}
              sitekey={HCAPTCHA_SITE_KEY}
              onVerify={(token) => setCaptchaToken(token)}
              onExpire={() => setCaptchaToken(null)}
            />
          </div>
        )}

        {reviewing && (
          <div className="rounded-2xl border border-primary/20 bg-card p-4 space-y-2">
            <p className="text-sm font-extrabold text-foreground">Resumo do pedido</p>
            {cartLines.map((line) => (
              <div key={`${line.name}-${line.detail}-${line.itemNotes ?? ""}`} className="flex justify-between text-sm gap-2">
                <div>
                  <span>{line.name} ({line.detail})</span>
                  {line.itemNotes?.trim() && (
                    <p className="text-xs text-amber-700">Obs: {line.itemNotes.trim()}</p>
                  )}
                </div>
                <span className="font-bold shrink-0">R$ {line.subtotal.toFixed(2).replace(".", ",")}</span>
              </div>
            ))}
            <p className="text-sm text-muted-foreground">Quantidade de itens: {itemCount}</p>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-emerald-700">
                <span>Desconto</span>
                <span>- R$ {discount.toFixed(2).replace(".", ",")}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span>Entrega</span>
              <span>R$ {deliveryFee.toFixed(2).replace(".", ",")}</span>
            </div>
            <div className="flex justify-between text-lg font-extrabold text-primary pt-2 border-t">
              <span>Total do pedido</span>
              <span>R$ {(estimatedTotal ? Math.max(0, estimatedTotal - discount + deliveryFee) : finalTotal).toFixed(2).replace(".", ",")}</span>
            </div>
            <p className="text-sm">Forma de pagamento: {paymentLabel(paymentMethod)}</p>
            <p className="text-sm text-emerald-700">Pagamento: somente no momento da entrega.</p>
          </div>
        )}

        {/* Botão submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full h-14 rounded-2xl gradient-hero text-white text-lg font-extrabold shadow-button flex items-center justify-center gap-2 transition-opacity active:opacity-90 disabled:opacity-60 mt-4"
        >
          {loading ? (
             <Loader2 className="h-5 w-5 animate-spin" />
          ) : reviewing ? (
            "Confirmar pedido"
          ) : (
            "Revisar e confirmar"
          )}
        </button>
        {reviewing && (
          <button
            type="button"
            onClick={() => setReviewing(false)}
            className="w-full text-sm font-bold text-slate-600"
          >
            Voltar e editar
          </button>
        )}
      </form>
    </div>
  );
}
