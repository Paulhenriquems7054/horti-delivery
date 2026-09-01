import { Loader2 } from "lucide-react";
import { useCatalogStats } from "@/hooks/useCatalogStats";

interface Props {
  storeId: string | undefined;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg font-extrabold text-foreground mt-0.5">{value}</p>
    </div>
  );
}

export function AdminCatalogMetrics({ storeId }: Props) {
  const { data, isLoading, isError } = useCatalogStats(storeId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando métricas do catálogo…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="text-sm text-red-600">Não foi possível carregar métricas do catálogo.</p>
    );
  }

  const coverage =
    data.totalActive > 0
      ? ((data.withCategory / data.totalActive) * 100).toFixed(1)
      : "0.0";

  const lastUpdate = data.lastCatalogActivityAt
    ? new Date(data.lastCatalogActivityAt).toLocaleString("pt-BR")
    : "—";

  const integrityOk = data.totalActive === data.withCategory + data.withoutCategory;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Stat label="Total ativos" value={String(data.totalActive)} />
        <Stat label="Com categoria" value={String(data.withCategory)} />
        <Stat label="Sem categoria" value={String(data.withoutCategory)} />
        <Stat label="Inativos" value={String(data.totalInactive)} />
        <Stat label="Cobertura" value={`${coverage}%`} />
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs text-muted-foreground">
        <span>Última atividade de importação: {lastUpdate}</span>
        {!integrityOk ? (
          <span className="text-red-600 font-medium">
            Inconsistência nas contagens — recarregue a página.
          </span>
        ) : (
          <span>Fonte: banco da loja (Hosted)</span>
        )}
      </div>
    </div>
  );
}
