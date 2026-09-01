import { Plug, Shield } from "lucide-react";

interface Props {
  storeId: string | undefined;
}

export function AdminPdvIntegrationPanel({ storeId }: Props) {
  return (
    <section className="bg-card p-5 rounded-2xl shadow-sm border border-dashed border-border space-y-3">
      <div>
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Plug className="h-4 w-4 text-primary" />
          Integração com PDV
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Preparação arquitetural — nenhuma integração ativa nesta etapa.
        </p>
      </div>

      <div className="rounded-xl bg-muted/40 p-4 space-y-2 text-xs text-muted-foreground">
        <p>
          <strong className="text-foreground">Fluxo previsto:</strong> PDV → credencial da integração →
          backend autentica → identifica a loja → normaliza payload → motor de sincronização → catálogo.
        </p>
        <p>
          <strong className="text-foreground">PDV será fonte de verdade para:</strong> nome, preço,
          disponibilidade, códigos interno/EAN.
        </p>
        <p>
          <strong className="text-foreground">HortiDelivery mantém:</strong> categoria, foto, descrição,
          destaque e ordem na vitrine.
        </p>
        <p className="flex items-start gap-1.5 pt-1">
          <Shield className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          O tenant nunca virá do payload do cliente — será resolvido pela credencial da integração
          {storeId ? ` (loja atual: ${storeId.slice(0, 8)}…)` : ""}.
        </p>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Status: <span className="font-bold text-amber-700">Não conectado</span> · contrato interno e
        migrations propostas em `src/lib/catalogIntegration/` e `supabase/migrations/` (não aplicadas).
      </p>
    </section>
  );
}
