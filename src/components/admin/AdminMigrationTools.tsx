import { FileSpreadsheet, Upload } from "lucide-react";
import { ProductSpreadsheetImport } from "@/components/admin/ProductSpreadsheetImport";

interface Props {
  storeId: string | undefined;
  onCsvImportClick: () => void;
  csvImportPending: boolean;
  onImported: () => void;
}

export function AdminMigrationTools({
  storeId,
  onCsvImportClick,
  csvImportPending,
  onImported,
}: Props) {
  return (
    <section className="bg-card p-5 rounded-2xl shadow-sm border border-border space-y-4">
      <div>
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-primary" />
          Importação e migração manual
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Ferramentas legadas para carga inicial ou atualização pontual via arquivo. Não substituem a
          futura sincronização com PDV.
        </p>
      </div>

      <div className="space-y-3 pt-1 border-t border-border">
        <p className="text-xs text-muted-foreground">
          CSV/TXT simples (Nome, Preço, Kg/Un) ou planilha Excel Beira Rio com auditoria completa.
        </p>
        <button
          type="button"
          onClick={onCsvImportClick}
          disabled={csvImportPending}
          className="w-full h-11 rounded-xl border border-dashed border-primary/50 text-primary bg-primary/5 hover:bg-primary/10 transition-colors text-sm font-bold flex items-center justify-center gap-2"
        >
          <Upload className="h-4 w-4" />
          Importar Mercadorias (CSV/TXT)
        </button>
        <ProductSpreadsheetImport storeId={storeId} onImported={onImported} />
      </div>
    </section>
  );
}
