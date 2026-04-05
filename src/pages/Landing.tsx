import { useState } from "react";
import { ArrowRight, Leaf, Truck, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Landing() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const handleGoToCatalog = async () => {
    setIsLoading(true);
    try {
      const { data: store, error } = await (supabase as any)
        .from("stores")
        .select("slug")
        .limit(1)
        .maybeSingle();

      if (error || !store) {
        toast.error("Nenhuma loja disponível no momento. Crie a sua na Área do Produtor!");
        return;
      }

      navigate(`/${store.slug}`);
    } catch (err) {
      toast.error("Erro ao buscar catálogo.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(120,12%,95%)] dark:bg-slate-900 overflow-x-hidden flex flex-col font-sans">
      {/* Navbar Minimalista */}
      <nav className="w-full px-6 py-5 flex items-center justify-between sticky top-0 bg-[hsl(120,12%,95%)]/80 dark:bg-slate-900/80 backdrop-blur-md z-50">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 min-w-[40px] rounded-xl gradient-hero flex items-center justify-center text-white shadow-button overflow-hidden p-1.5">
            <img 
              src="/play_store_512.png" 
              alt="HortiDelivery" 
              className="w-full h-full object-contain"
            />
          </div>
          <span className="font-extrabold text-xl text-slate-800 dark:text-slate-100 tracking-tight hidden sm:block">horti<span className="text-emerald-600 dark:text-emerald-400">delivery</span></span>
        </div>
        <ThemeToggle variant="compact" className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200" />
      </nav>

      <main className="flex-1 flex flex-col px-4 mx-auto w-full max-w-5xl animate-fade-in relative">
        
        {/* Efeitos de Fundo Decorativos */}
        <div className="absolute top-10 left-0 w-72 h-72 bg-emerald-400 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob" />
        <div className="absolute top-20 right-0 w-72 h-72 bg-amber-300 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000" />
        
        {/* Hero Section */}
        <section className="text-center mt-16 md:mt-24 relative z-10 animate-slide-up">
          <div className="mx-auto mb-8 flex h-28 w-28 items-center justify-center rounded-[2rem] bg-white border border-slate-100 shadow-xl transform rotate-3 hover:rotate-0 transition-transform duration-500 ease-out overflow-hidden">
            <img 
              src="/play_store_512.png" 
              alt="HortiDelivery Logo" 
              className="w-full h-full object-contain p-2 transition-transform hover:scale-110 duration-300"
            />
          </div>
          
          <h1 className="text-5xl md:text-7xl font-black text-slate-900 dark:text-slate-100 leading-[1.05] tracking-tight mb-6">
            O melhor da colheita,<br className="hidden md:block"/>
            <span className="text-emerald-600 dark:text-emerald-400">direto para sua mesa.</span>
          </h1>
          
          <p className="text-lg md:text-xl text-slate-500 dark:text-slate-400 font-medium mb-12 max-w-2xl mx-auto leading-relaxed">
            Descubra catálogos exclusivos de produtores locais. Monte sua cesta 
            com alimentos 100% frescos e receba no conforto do seu lar.
          </p>
          
          <button 
            onClick={handleGoToCatalog}
            disabled={isLoading}
            className="group relative inline-flex items-center justify-center gap-3 h-16 px-10 rounded-full gradient-hero text-white font-extrabold text-lg md:text-xl shadow-button hover:shadow-lg transition-all sm:hover:scale-105 active:scale-[0.98] overflow-hidden disabled:opacity-70 disabled:pointer-events-none"
          >
            <span className="relative z-10 flex items-center gap-2">
              Explorar Lojas Locais
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1.5 transition-transform" />
            </span>
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          </button>
          
          <div className="mt-8 flex items-center justify-center gap-4 text-sm font-bold text-slate-400">
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-500" /> Compra segura</span>
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <span className="flex items-center gap-1.5"><Truck className="h-4 w-4 text-amber-500" /> Entrega local</span>
          </div>
        </section>

        {/* Informações Rápidas (Cards) */}
        <section className="mt-24 md:mt-32 pb-20 grid grid-cols-1 sm:grid-cols-3 gap-6 relative z-10">
          <div className="bg-card dark:bg-card p-6 rounded-3xl border border-border shadow-sm flex flex-col gap-4 hover:-translate-y-1.5 transition-all duration-300 hover:shadow-md cursor-default group">
            <div className="h-14 w-14 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-500 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <Leaf className="h-7 w-7" />
            </div>
            <div>
              <h3 className="font-extrabold text-foreground text-lg mb-1.5">100% Selecionados</h3>
              <p className="text-sm text-muted-foreground font-medium leading-relaxed">Apenas o que há de mais fresco e bonito vai na sua sacola ecológica.</p>
            </div>
          </div>
          <div className="bg-card dark:bg-card p-6 rounded-3xl border border-border shadow-sm flex flex-col gap-4 hover:-translate-y-1.5 transition-all duration-300 hover:shadow-md cursor-default group">
            <div className="h-14 w-14 rounded-2xl bg-amber-50 dark:bg-amber-900/30 text-amber-500 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <Truck className="h-7 w-7" />
            </div>
            <div>
              <h3 className="font-extrabold text-foreground text-lg mb-1.5">Entrega Ágil</h3>
              <p className="text-sm text-muted-foreground font-medium leading-relaxed">Chega na porta de casa com segurança, acondicionado para não amassar nada.</p>
            </div>
          </div>
          <div className="bg-card dark:bg-card p-6 rounded-3xl border border-border shadow-sm flex flex-col gap-4 hover:-translate-y-1.5 transition-all duration-300 hover:shadow-md cursor-default group">
            <div className="h-14 w-14 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-500 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <div>
              <h3 className="font-extrabold text-foreground text-lg mb-1.5">Pagamento na Porta</h3>
              <p className="text-sm text-muted-foreground font-medium leading-relaxed">Sem dor de cabeça com cartão online. Você só paga na hora da entrega feliz.</p>
            </div>
          </div>
        </section>
        
        {/* Como Funciona (Step by Step) */}
        <section className="mt-16 md:mt-24 pb-20 relative z-10 w-full bg-card/50 dark:bg-card/30 backdrop-blur-sm rounded-[3rem] p-10 md:p-14 border border-border shadow-sm">
          <div className="text-center mb-16 animate-slide-up">
            <h2 className="text-3xl md:text-5xl font-black text-foreground mb-4">Como funciona?</h2>
            <p className="text-muted-foreground font-medium max-w-xl mx-auto">Três passos simples para a verdadeira feira de bairro chegar até você!</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8 text-center relative">
            {/* Linha conectora (visível apenas no desktop) */}
            <div className="hidden md:block absolute top-[43px] left-[16%] right-[16%] h-1.5 bg-emerald-100 dark:bg-emerald-900/50 rounded-full" />

            {/* Passo 1 */}
            <div className="flex flex-col items-center relative z-10 group">
              <div className="w-24 h-24 rounded-full bg-card dark:bg-card border-[6px] border-emerald-50 dark:border-emerald-900/50 shadow-md flex items-center justify-center text-3xl mb-6 group-hover:scale-110 transition-transform duration-300">
                📱
              </div>
              <h3 className="font-extrabold text-xl text-foreground mb-2">1. Escolha Diferenciada</h3>
              <p className="text-muted-foreground text-sm leading-relaxed px-2">Selecione legumes, verduras e frutas fresquinhas no nosso catálogo digital toda semana.</p>
            </div>

            {/* Passo 2 */}
            <div className="flex flex-col items-center relative z-10 group">
              <div className="w-24 h-24 rounded-full bg-card dark:bg-card border-[6px] border-emerald-50 dark:border-emerald-900/50 shadow-md flex items-center justify-center text-3xl mb-6 group-hover:scale-110 transition-transform duration-300">
                🛒
              </div>
              <h3 className="font-extrabold text-xl text-foreground mb-2">2. Monte sua Cesta</h3>
              <p className="text-muted-foreground text-sm leading-relaxed px-2">Adicione os itens desejados, insira seu endereço e confirme o pedido de forma muito rápida.</p>
            </div>

            {/* Passo 3 */}
            <div className="flex flex-col items-center relative z-10 group">
              <div className="w-24 h-24 rounded-full bg-card dark:bg-card border-[6px] border-emerald-50 dark:border-emerald-900/50 shadow-md flex items-center justify-center text-3xl mb-6 group-hover:scale-110 transition-transform duration-300">
                🛵
              </div>
              <h3 className="font-extrabold text-xl text-foreground mb-2">3. Receba e Pague</h3>
              <p className="text-muted-foreground text-sm leading-relaxed px-2">Receba no conforto de casa com qualidade garantida. Pague só quando a mercadoria chegar!</p>
            </div>
          </div>
        </section>

        {/* Depoimentos Sintéticos */}
        <section className="mt-8 md:mt-16 relative z-10 w-full text-center">
          <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-amber-50 text-amber-600 font-bold text-sm mb-6 border border-amber-100">
            ⭐⭐⭐⭐⭐  Avaliados por centenas de clientes da região
          </div>
        </section>

        {/* CTA Banner Fim */}
        <section className="mt-10 md:mt-16 mb-16 relative z-10 w-full bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-[3rem] p-10 md:p-16 text-center shadow-2xl overflow-hidden group">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000" />
          <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-emerald-900 opacity-20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000" />
          
          <h2 className="text-3xl md:text-5xl font-black text-white mb-6 relative z-10">Aproveite enquanto as prateleiras estão cheias!</h2>
          <p className="text-emerald-100 font-medium mb-10 max-w-2xl mx-auto relative z-10 text-lg">Renovamos o catálogo pra garantir que a colheita chegue 100% fresca na sua mesa.</p>
          
          <button 
            onClick={handleGoToCatalog}
            disabled={isLoading}
            className="relative z-10 inline-flex h-16 w-full sm:w-auto px-12 items-center justify-center rounded-full bg-white text-emerald-700 font-black text-lg md:text-xl shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-70 disabled:pointer-events-none"
          >
            Montar Meu Pedido Agora
          </button>
        </section>
        
      </main>
      
      <footer className="w-full text-center py-8 pb-12 text-muted-foreground text-sm font-medium">
        <p>© {new Date().getFullYear()} HortiDelivery. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
