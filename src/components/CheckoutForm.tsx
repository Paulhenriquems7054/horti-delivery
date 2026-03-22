import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

interface Props {
  loading: boolean;
  onSubmit: (data: { customer_name: string; phone: string; address: string }) => void;
  onBack: () => void;
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function CheckoutForm({ loading, onSubmit, onBack }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const isValid = name.trim().length >= 2 && phone.replace(/\D/g, "").length >= 10 && address.trim().length >= 5;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onSubmit({ customer_name: name.trim(), phone, address: address.trim() });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-semibold text-foreground mb-1 block">Nome</label>
        <Input
          placeholder="Seu nome completo"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-12 text-base"
        />
      </div>
      <div>
        <label className="text-sm font-semibold text-foreground mb-1 block">Telefone</label>
        <Input
          placeholder="(00) 00000-0000"
          value={phone}
          onChange={(e) => setPhone(formatPhone(e.target.value))}
          className="h-12 text-base"
          type="tel"
        />
      </div>
      <div>
        <label className="text-sm font-semibold text-foreground mb-1 block">Endereço de entrega</label>
        <Input
          placeholder="Rua, número, bairro"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="h-12 text-base"
        />
      </div>
      <Button
        type="submit"
        disabled={!isValid || loading}
        className="w-full h-14 text-lg font-bold"
        size="lg"
      >
        {loading ? <Loader2 className="animate-spin mr-2" /> : null}
        {loading ? "Enviando..." : "Finalizar Pedido"}
      </Button>
      <Button type="button" variant="ghost" onClick={onBack} className="w-full">
        ← Voltar
      </Button>
    </form>
  );
}
