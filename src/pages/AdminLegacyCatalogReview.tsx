/**
 * Fluxo legado de revisão assistida da planilha Beira Rio.
 * Isolado da operação diária — usa snapshot local e localStorage.
 * Acesso: /admin/basket/legacy-review
 */
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ProductManualReviewAssist } from "@/components/admin/ProductManualReviewAssist";

export default function AdminLegacyCatalogReview() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="bg-slate-900 text-white px-4 py-4 sticky top-0 z-10 shadow-md">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/admin/basket")}
            className="h-9 w-9 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-base font-extrabold leading-tight">Revisão legada (planilha)</h1>
            <p className="text-xs text-white/70">
              Snapshot local — não altera o catálogo no Hosted diretamente.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-4 space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900">
          Esta tela foi usada na migração inicial da planilha Excel. Para operação normal, use{" "}
          <strong>Produtos sem categoria</strong> no painel principal — dados vêm do banco real.
        </div>
        <ProductManualReviewAssist />
      </div>
    </div>
  );
}
