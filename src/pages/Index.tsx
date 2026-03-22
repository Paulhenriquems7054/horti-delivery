import { useState } from "react";
import { useActiveBasket } from "@/hooks/useActiveBasket";
import { useCreateOrder } from "@/hooks/useCreateOrder";
import { ProductCard } from "@/components/ProductCard";
import { CheckoutForm } from "@/components/CheckoutForm";
import { Button } from "@/components/ui/button";
import { ShoppingCart, CheckCircle2, Leaf } from "lucide-react";
import { toast } from "sonner";

type Step = "basket" | "checkout" | "confirmation";

export default function Index() {
  const { data: basket, isLoading } = useActiveBasket();
  const createOrder = useCreateOrder();
  const [step, setStep] = useState<Step>("basket");

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground text-lg">Carregando...</div>
      </div>
    );
  }

  if (!basket) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="text-center">
          <Leaf className="mx-auto h-16 w-16 text-primary mb-4" />
          <h1 className="text-2xl font-bold text-foreground">Nenhuma cesta disponível</h1>
          <p className="text-muted-foreground mt-2">Volte em breve para conferir nossas novidades!</p>
        </div>
      </div>
    );
  }

  if (step === "confirmation") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="text-center max-w-sm">
          <CheckCircle2 className="mx-auto h-20 w-20 text-primary mb-4" />
          <h1 className="text-2xl font-extrabold text-foreground">Pedido recebido!</h1>
          <p className="text-muted-foreground mt-2 text-lg">Vamos preparar sua cesta com todo carinho 🥬</p>
          <div className="mt-6 rounded-xl bg-accent p-4 text-left">
            <p className="text-sm font-semibold text-accent-foreground">{basket.name}</p>
            <p className="text-2xl font-extrabold text-primary mt-1">
              R$ {basket.price.toFixed(2).replace(".", ",")}
            </p>
          </div>
          <Button className="mt-6 w-full h-12" onClick={() => setStep("basket")}>
            Voltar ao início
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-primary px-4 py-4 shadow-md">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <Leaf className="h-8 w-8 text-primary-foreground" />
          <div>
            <h1 className="text-lg font-extrabold text-primary-foreground leading-tight">
              BeiraRio Delivery
            </h1>
            <p className="text-xs text-primary-foreground/80">Hortifruti fresquinho na sua porta</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pb-8">
        {step === "basket" && (
          <>
            {/* Basket Hero */}
            <div className="mt-6 rounded-2xl bg-accent p-5">
              <p className="text-sm font-semibold text-accent-foreground uppercase tracking-wide">
                🥗 Cesta da semana
              </p>
              <h2 className="text-2xl font-extrabold text-foreground mt-1">{basket.name}</h2>
              <p className="text-3xl font-extrabold text-primary mt-2">
                R$ {basket.price.toFixed(2).replace(".", ",")}
              </p>
            </div>

            {/* Products */}
            <div className="mt-4 space-y-2">
              {basket.products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>

            {/* CTA */}
            <div className="mt-6">
              <Button
                onClick={() => setStep("checkout")}
                className="w-full h-14 text-lg font-bold shadow-lg"
                size="lg"
              >
                <ShoppingCart className="mr-2 h-5 w-5" />
                Comprar agora
              </Button>
            </div>
          </>
        )}

        {step === "checkout" && (
          <div className="mt-6">
            <h2 className="text-xl font-extrabold text-foreground mb-1">Finalizar pedido</h2>
            <p className="text-muted-foreground mb-4">
              {basket.name} — R$ {basket.price.toFixed(2).replace(".", ",")}
            </p>
            <CheckoutForm
              loading={createOrder.isPending}
              onBack={() => setStep("basket")}
              onSubmit={(data) => {
                createOrder.mutate(
                  { ...data, total: basket.price, products: basket.products },
                  {
                    onSuccess: () => {
                      toast.success("Pedido enviado com sucesso!");
                      setStep("confirmation");
                    },
                    onError: () => {
                      toast.error("Erro ao enviar pedido. Tente novamente.");
                    },
                  }
                );
              }}
            />
          </div>
        )}
      </main>
    </div>
  );
}
