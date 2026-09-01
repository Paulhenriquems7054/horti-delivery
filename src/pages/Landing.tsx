import { useEffect, useState } from "react";
import { ArrowRight, Leaf, Loader2, Truck, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { StoreLogo } from "@/components/StoreLogo";
import { PoweredByHortiDelivery } from "@/components/PoweredByHortiDelivery";
import { shouldRedirectLandingToStore, useLandingStore } from "@/hooks/useLandingStore";

export default function Landing() {
  const navigate = useNavigate();
  const { data: store, isLoading, isError } = useLandingStore();
  const [ctaLoading, setCtaLoading] = useState(false);

  useEffect(() => {
    if (!shouldRedirectLandingToStore() || !store?.slug) return;
    navigate(`/${store.slug}`, { replace: true });
  }, [store?.slug, navigate]);

  const goToCatalog = () => {
    if (!store?.slug) {
      toast.error("Nenhuma loja disponível no momento.");
      return;
    }
    setCtaLoading(true);
    navigate(`/${store.slug}`);
  };

  const storeName = store?.name ?? "Nossa loja";
  const catalogLabel = store ? `Ver catálogo ${store.name}` : "Ver catálogo";

  return (
    <div className="min-h-screen bg-background overflow-x-hidden flex flex-col font-sans">
      <nav className="w-full px-6 py-5 grid grid-cols-[auto_1fr_auto] items-center gap-4 sticky top-0 bg-background/80 backdrop-blur-md z-50 border-b border-border/40">
        <div className="w-10" aria-hidden />
        <div className="flex flex-col items-center text-center min-w-0">
          <p className="font-extrabold text-2xl md:text-3xl text-foreground tracking-tight leading-tight">
            {isLoading ? "Carregando…" : storeName}
          </p>
          <PoweredByHortiDelivery className="text-xs md:text-sm block mt-1" />
        </div>
        <ThemeToggle className="bg-muted text-foreground shrink-0" />
      </nav>

      <main className="flex-1 flex flex-col px-4 mx-auto w-full max-w-5xl animate-fade-in relative">
        <div className="absolute top-10 left-0 w-72 h-72 bg-emerald-400 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob" />
        <div className="absolute top-20 right-0 w-72 h-72 bg-amber-300 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000" />

        <section className="text-center mt-16 md:mt-24 relative z-10 animate-slide-up">
          <div className="mx-auto mb-6 flex h-32 w-32 md:h-36 md:w-36 items-center justify-center rounded-[2rem] bg-card border border-border shadow-xl p-2">
            {isLoading ? (
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            ) : (
              <StoreLogo
                logoPath={store?.logo_path}
                logoVersion={store?.updated_at}
                alt={storeName}
                className="h-full w-full"
                objectPosition="center 38%"
              />
            )}
          </div>

          <h1 className="text-5xl md:text-7xl font-black text-slate-900 dark:text-slate-100 leading-[1.05] tracking-tight mb-6">
            O melhor da colheita,
            <br className="hidden md:block" />
            <span className="text-emerald-600 dark:text-emerald-400"> direto para sua mesa.</span>
          </h1>

          <p className="text-lg md:text-xl text-slate-500 dark:text-slate-400 font-medium mb-12 max-w-2xl mx-auto leading-relaxed">
            {store?.description?.trim() ||
              "Monte sua cesta com produtos frescos e receba no conforto do seu lar."}
          </p>

          {isError ? (
            <p className="text-sm text-red-600 mb-6">Não foi possível carregar os dados da loja.</p>
          ) : null}

          <button
            type="button"
            onClick={goToCatalog}
            disabled={isLoading || ctaLoading || !store?.slug}
            className="group relative inline-flex items-center justify-center gap-3 h-16 px-10 rounded-full gradient-hero text-white font-extrabold text-lg md:text-xl shadow-button hover:shadow-lg transition-all sm:hover:scale-105 active:scale-[0.98] overflow-hidden disabled:opacity-70 disabled:pointer-events-none"
          >
            <span className="relative z-10 flex items-center gap-2">
              {catalogLabel}
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1.5 transition-transform" />
            </span>
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          </button>

          <div className="mt-8 flex items-center justify-center gap-4 text-sm font-bold text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-500" /> Compra segura
            </span>
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <span className="flex items-center gap-1.5">
              <Truck className="h-4 w-4 text-amber-500" /> Entrega local
            </span>
          </div>
        </section>

        <section className="mt-24 md:mt-32 pb-20 grid grid-cols-1 sm:grid-cols-3 gap-6 relative z-10">
          <div className="bg-card p-6 rounded-3xl border border-border shadow-sm flex flex-col gap-4 hover:-translate-y-1.5 transition-all duration-300 hover:shadow-md cursor-default group">
            <div className="h-14 w-14 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-500 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <Leaf className="h-7 w-7" />
            </div>
            <div>
              <h3 className="font-extrabold text-foreground text-lg mb-1.5">100% Selecionados</h3>
              <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                Apenas o que há de mais fresco e bonito vai na sua sacola.
              </p>
            </div>
          </div>
          <div className="bg-card p-6 rounded-3xl border border-border shadow-sm flex flex-col gap-4 hover:-translate-y-1.5 transition-all duration-300 hover:shadow-md cursor-default group">
            <div className="h-14 w-14 rounded-2xl bg-amber-50 dark:bg-amber-900/30 text-amber-500 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <Truck className="h-7 w-7" />
            </div>
            <div>
              <h3 className="font-extrabold text-foreground text-lg mb-1.5">Entrega Ágil</h3>
              <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                Chega na porta de casa com segurança e cuidado.
              </p>
            </div>
          </div>
          <div className="bg-card p-6 rounded-3xl border border-border shadow-sm flex flex-col gap-4 hover:-translate-y-1.5 transition-all duration-300 hover:shadow-md cursor-default group">
            <div className="h-14 w-14 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-500 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <div>
              <h3 className="font-extrabold text-foreground text-lg mb-1.5">Pagamento na Porta</h3>
              <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                Você paga somente na hora da entrega.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-16 md:mt-24 pb-20 relative z-10 w-full bg-card/50 dark:bg-card/30 backdrop-blur-sm rounded-[3rem] p-10 md:p-14 border border-border shadow-sm">
          <div className="text-center mb-16 animate-slide-up">
            <h2 className="text-3xl md:text-5xl font-black text-foreground mb-4">Como funciona?</h2>
            <p className="text-muted-foreground font-medium max-w-xl mx-auto">
              Três passos simples para a feira chegar até você!
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8 text-center relative">
            <div className="hidden md:block absolute top-[43px] left-[16%] right-[16%] h-1.5 bg-emerald-100 dark:bg-emerald-900/50 rounded-full" />
            {[
              { emoji: "📱", title: "1. Escolha", text: "Selecione produtos frescos no catálogo digital." },
              { emoji: "🛒", title: "2. Monte sua cesta", text: "Adicione itens, informe o endereço e confirme." },
              { emoji: "🛵", title: "3. Receba e pague", text: "Entrega em casa — pagamento na porta." },
            ].map((step) => (
              <div key={step.title} className="flex flex-col items-center relative z-10 group">
                <div className="w-24 h-24 rounded-full bg-card border-[6px] border-emerald-50 dark:border-emerald-900/50 shadow-md flex items-center justify-center text-3xl mb-6 group-hover:scale-110 transition-transform duration-300">
                  {step.emoji}
                </div>
                <h3 className="font-extrabold text-xl text-foreground mb-2">{step.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed px-2">{step.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 md:mt-16 mb-16 relative z-10 w-full bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-[3rem] p-10 md:p-16 text-center shadow-2xl overflow-hidden group">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000" />
          <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-emerald-900 opacity-20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000" />

          <h2 className="text-3xl md:text-5xl font-black text-white mb-6 relative z-10">
            Pronto para montar seu pedido?
          </h2>
          <p className="text-emerald-100 font-medium mb-10 max-w-2xl mx-auto relative z-10 text-lg">
            Acesse o catálogo de {storeName} e faça seu pedido em poucos minutos.
          </p>

          <button
            type="button"
            onClick={goToCatalog}
            disabled={isLoading || ctaLoading || !store?.slug}
            className="relative z-10 inline-flex h-16 w-full sm:w-auto px-12 items-center justify-center rounded-full bg-white text-emerald-700 font-black text-lg md:text-xl shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-70 disabled:pointer-events-none"
          >
            Montar Meu Pedido Agora
          </button>
        </section>
      </main>

      <footer className="w-full text-center py-8 pb-12 px-4 space-y-2">
        <p className="text-foreground text-sm font-semibold">
          © {new Date().getFullYear()} {storeName}
        </p>
        <p className="text-xs">
          <PoweredByHortiDelivery />
        </p>
      </footer>
    </div>
  );
}
