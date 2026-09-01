import { useQuery } from "@tanstack/react-query";
import { History, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  storeId: string | undefined;
}

type ProductImportRow = {
  id: string;
  filename: string;
  status: string;
  total_rows: number;
  inserted_rows: number;
  skipped_existing_rows: number;
  error_rows: number;
  started_at: string;
  finished_at: string | null;
  expected_batches: number | null;
  batches_completed: number;
};

function statusLabel(status: string): string {
  if (status === "completed") return "Concluída";
  if (status === "failed") return "Falhou";
  if (status === "running") return "Em andamento";
  return status;
}

export function ProductImportHistory({ storeId }: Props) {
  const importsQuery = useQuery({
    queryKey: ["product-import-history", storeId],
    queryFn: async () => {
      if (!storeId) return [] as ProductImportRow[];
      const { data, error } = await supabase
        .from("product_imports")
        .select(
          "id, filename, status, total_rows, inserted_rows, skipped_existing_rows, error_rows, started_at, finished_at, expected_batches, batches_completed",
        )
        .eq("store_id", storeId)
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as ProductImportRow[];
    },
    enabled: !!storeId,
    staleTime: 30_000,
  });

  return (
    <section className="bg-card p-5 rounded-2xl shadow-sm border border-border space-y-4">
      <div>
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          Histórico de importações
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Registros reais de `product_imports` — planilhas e lotes processados no Hosted.
        </p>
      </div>

      {importsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando histórico…
        </div>
      ) : (importsQuery.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma importação registrada ainda.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left p-2 font-bold">Arquivo</th>
                <th className="text-left p-2 font-bold">Data</th>
                <th className="text-left p-2 font-bold">Status</th>
                <th className="text-right p-2 font-bold">Total</th>
                <th className="text-right p-2 font-bold">Inseridos</th>
                <th className="text-right p-2 font-bold">Ignorados</th>
                <th className="text-right p-2 font-bold">Erros</th>
              </tr>
            </thead>
            <tbody>
              {importsQuery.data?.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="p-2 font-medium max-w-[180px] truncate" title={row.filename}>
                    {row.filename}
                  </td>
                  <td className="p-2 text-muted-foreground whitespace-nowrap">
                    {new Date(row.started_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="p-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                        row.status === "completed"
                          ? "bg-emerald-100 text-emerald-800"
                          : row.status === "failed"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="p-2 text-right">{row.total_rows}</td>
                  <td className="p-2 text-right">{row.inserted_rows}</td>
                  <td className="p-2 text-right">{row.skipped_existing_rows}</td>
                  <td className="p-2 text-right">{row.error_rows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
