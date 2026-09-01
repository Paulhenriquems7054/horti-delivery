import { Link } from "react-router-dom";
import { StoreLogo } from "@/components/StoreLogo";
import { useLandingStore } from "@/hooks/useLandingStore";

export default function NotFound() {
  const { data: store } = useLandingStore();
  const storeName = store?.name ?? "Logo";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="text-center max-w-xs animate-pop-in">
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full gradient-card overflow-hidden p-3">
          <StoreLogo
            logoPath={store?.logo_path}
            logoVersion={store?.updated_at}
            alt={storeName}
            className="h-full w-full"
          />
        </div>
        <h1 className="text-6xl font-extrabold text-primary">404</h1>
        <p className="mt-3 text-xl font-extrabold text-foreground">Página não encontrada</p>
        <p className="text-muted-foreground mt-2 text-sm">
          Essa página saiu do cardápio! 😅
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 h-12 px-6 rounded-2xl gradient-hero text-white font-bold shadow-button overflow-hidden"
        >
          <div className="h-4 w-4 flex items-center justify-center">
            <StoreLogo
              logoPath={store?.logo_path}
              logoVersion={store?.updated_at}
              alt={storeName}
              className="h-full w-full"
            />
          </div>
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
