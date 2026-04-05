import { Link } from "react-router-dom";
import { Leaf } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="text-center max-w-xs animate-pop-in">
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full gradient-card overflow-hidden p-3">
          <img 
            src="/play_store_512.png" 
            alt="Logo" 
            className="w-full h-full object-contain"
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
            <img 
              src="/play_store_512.png" 
              alt="Logo" 
              className="w-full h-full object-contain"
            />
          </div>
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
