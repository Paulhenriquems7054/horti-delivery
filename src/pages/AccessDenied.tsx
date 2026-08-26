import { Link } from "react-router-dom";
import { ShieldOff } from "lucide-react";

export default function AccessDenied() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
      <ShieldOff className="h-12 w-12 text-slate-500 mb-4" />
      <h1 className="text-xl font-extrabold text-white">Acesso negado</h1>
      <p className="text-slate-400 text-sm mt-2 max-w-sm">
        Esta área é restrita a operadores da plataforma.
      </p>
      <div className="flex gap-3 mt-6">
        <Link to="/login" className="h-10 px-4 rounded-xl bg-slate-800 text-white text-sm font-bold flex items-center">
          Login
        </Link>
        <Link to="/admin" className="h-10 px-4 rounded-xl bg-violet-600 text-white text-sm font-bold flex items-center">
          Painel da loja
        </Link>
      </div>
    </div>
  );
}
