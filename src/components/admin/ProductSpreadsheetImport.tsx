import { useMemo, useRef, useState } from "react";
import { Loader2, FileSpreadsheet, AlertTriangle, CheckCircle2, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { parseBeiraRioSpreadsheetFile } from "@/lib/productImport/parseBeiraRioSpreadsheet";
import { formatBrazilianCurrency } from "@/lib/productImport/parseBrazilianPrice";
import { hasCriticalSpreadsheetErrors } from "@/lib/productImport/validateRows";
import type { ImportPreviewStats, ParsedImportRow } from "@/lib/productImport/types";
import { useProductSpreadsheetImport } from "@/hooks/useProductSpreadsheetImport";

type Step = "select" | "preview" | "importing" | "done";

interface ProductSpreadsheetImportProps {
  storeId: string | undefined;
  onImported?: () => void;
}

const PAGE_SIZE = 100;

type PreviewFilter = "valid" | "problems" | "all";

export function ProductSpreadsheetImport({ storeId, onImported }: ProductSpreadsheetImportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("select");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedImportRow[]>([]);
  const [stats, setStats] = useState<ImportPreviewStats | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    inserted: number;
    skippedExisting: number;
    errors: number;
    total: number;
  } | null>(null);
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>("valid");
  const [searchQuery, setSearchQuery] = useState("");
  const [previewPage, setPreviewPage] = useState(0);

  const { fetchExistingIdentifiers, importProducts, isImporting, progress } =
    useProductSpreadsheetImport(storeId);

  const filteredPreviewRows = useMemo(() => {
    let list = rows;
    if (previewFilter === "valid") {
      list = rows.filter((row) => row.status === "VALID");
    } else if (previewFilter === "problems") {
      list = rows.filter((row) => row.status !== "VALID");
    }

    const query = searchQuery.trim().toLowerCase();
    if (!query) return list;

    return list.filter(
      (row) =>
        row.name.toLowerCase().includes(query) ||
        row.internalCode.toLowerCase().includes(query) ||
        row.barcode.toLowerCase().includes(query),
    );
  }, [rows, previewFilter, searchQuery]);

  const totalPreviewPages = Math.max(1, Math.ceil(filteredPreviewRows.length / PAGE_SIZE));
  const previewRows = useMemo(() => {
    const start = previewPage * PAGE_SIZE;
    return filteredPreviewRows.slice(start, start + PAGE_SIZE);
  }, [filteredPreviewRows, previewPage]);

  const problemRows = useMemo(
    () => rows.filter((row) => row.status !== "VALID" && row.status !== "DUPLICATE_EXISTING").slice(0, 50),
    [rows],
  );

  const resetState = () => {
    setStep("select");
    setSelectedFile(null);
    setRows([]);
    setStats(null);
    setParseError(null);
    setImportSummary(null);
    setPreviewFilter("valid");
    setSearchQuery("");
    setPreviewPage(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && isImporting) return;
    setOpen(next);
    if (!next) resetState();
  };

  const handleAnalyze = async () => {
    if (!selectedFile) {
      toast.error("Selecione um arquivo Excel.");
      return;
    }

    setIsAnalyzing(true);
    setParseError(null);
    const loadingId = "spreadsheet-analyze";

    try {
      toast.loading("Lendo planilha...", { id: loadingId });
      const existing = await fetchExistingIdentifiers();
      const result = await parseBeiraRioSpreadsheetFile(selectedFile, existing);
      if (!result.ok) {
        setParseError(result.error);
        setRows([]);
        setStats(null);
        toast.error(result.error, { id: loadingId });
        return;
      }

      setRows(result.rows);
      setStats(result.stats);
      setPreviewPage(0);
      setPreviewFilter("valid");
      setSearchQuery("");
      setStep("preview");
      toast.success(
        `${result.stats.validRows.toLocaleString("pt-BR")} produtos válidos de ${result.stats.totalRows.toLocaleString("pt-BR")} linhas`,
        { id: loadingId },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao analisar planilha";
      setParseError(message);
      toast.error(message, { id: loadingId });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleImport = async () => {
    if (!selectedFile || !stats) return;

    setStep("importing");
    try {
      const result = await importProducts(selectedFile.name, rows, stats);
      setImportSummary({
        inserted: result.inserted,
        skippedExisting: result.skippedExisting + stats.duplicateExistingRows,
        errors: result.errors + stats.invalidRows + stats.duplicateRows,
        total: stats.totalRows,
      });
      setStep("done");
      toast.success("Importação concluída");
      onImported?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro na importação";
      toast.error(message);
      setStep("preview");
    }
  };

  const canImport = stats != null && !hasCriticalSpreadsheetErrors(stats) && stats.validRows > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full h-11 rounded-xl border border-dashed border-emerald-600/50 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors text-sm font-bold flex items-center justify-center gap-2"
      >
        <FileSpreadsheet className="h-4 w-4" />
        <span>Importar mercadorias (Excel)</span>
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar mercadorias</DialogTitle>
            <DialogDescription>
              Planilha Beira Rio (.xls / .xlsx). Apenas produtos novos serão inseridos — existentes não serão alterados.
            </DialogDescription>
          </DialogHeader>

          {step === "select" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-dashed border-border p-6 text-center space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(event) => {
                    setSelectedFile(event.target.files?.[0] ?? null);
                    setParseError(null);
                  }}
                />
                <p className="text-sm text-muted-foreground">
                  Colunas esperadas: Código, Código de Barras, Produto, Preço de Venda
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
                >
                  Selecionar arquivo Excel
                </button>
                {selectedFile && (
                  <p className="text-xs text-muted-foreground truncate">
                    Arquivo: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              {parseError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{parseError}</span>
                </div>
              )}
            </div>
          )}

          {step === "preview" && stats && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Linhas encontradas" value={stats.totalRows} />
                <StatCard label="Válidas" value={stats.validRows} tone="success" />
                <StatCard label="Com erro" value={stats.invalidRows} tone="danger" />
                <StatCard label="Duplicadas" value={stats.duplicateRows + stats.duplicateExistingRows} tone="warn" />
              </div>

              <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  {(["valid", "problems", "all"] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => {
                        setPreviewFilter(filter);
                        setPreviewPage(0);
                      }}
                      className={`h-8 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                        previewFilter === filter
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-muted-foreground border-border hover:bg-muted"
                      }`}
                    >
                      {filter === "valid" ? "Válidos" : filter === "problems" ? "Com problemas" : "Todos"}
                    </button>
                  ))}
                </div>
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPreviewPage(0);
                    }}
                    placeholder="Buscar por nome, código ou barras..."
                    className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-card text-sm"
                  />
                </div>
              </div>

              <div className="rounded-xl border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Linha</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Código de barras</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Preço</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row) => (
                      <TableRow key={row.rowNumber}>
                        <TableCell>{row.rowNumber}</TableCell>
                        <TableCell>{row.internalCode}</TableCell>
                        <TableCell>{row.barcode}</TableCell>
                        <TableCell className="max-w-[240px] truncate">{row.name}</TableCell>
                        <TableCell className="text-right">
                          {row.price ? formatBrazilianCurrency(row.price) : row.priceDisplay}
                        </TableCell>
                        <TableCell>
                          <StatusBadge row={row} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-muted-foreground">
                <p>
                  Exibindo {previewRows.length.toLocaleString("pt-BR")} de{" "}
                  {filteredPreviewRows.length.toLocaleString("pt-BR")} linhas
                  {previewFilter === "valid" ? " válidas" : previewFilter === "problems" ? " com problemas" : ""}
                  {searchQuery.trim() ? ` (filtro: "${searchQuery.trim()}")` : ""}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={previewPage <= 0}
                    onClick={() => setPreviewPage((p) => Math.max(0, p - 1))}
                    className="h-8 px-2 rounded-lg border disabled:opacity-40 inline-flex items-center gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </button>
                  <span>
                    Página {previewPage + 1} / {totalPreviewPages}
                  </span>
                  <button
                    type="button"
                    disabled={previewPage >= totalPreviewPages - 1}
                    onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages - 1, p + 1))}
                    className="h-8 px-2 rounded-lg border disabled:opacity-40 inline-flex items-center gap-1"
                  >
                    Próxima
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {problemRows.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <p className="text-sm font-semibold text-amber-900">Problemas detectados</p>
                  <ul className="text-xs text-amber-900 space-y-1 max-h-32 overflow-y-auto">
                    {problemRows.map((row) => (
                      <li key={`problem-${row.rowNumber}`}>
                        Linha {row.rowNumber}: {row.messages.join("; ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!canImport && (
                <p className="text-sm text-destructive font-medium">
                  Corrija os erros ou inclua ao menos uma linha válida antes de importar.
                </p>
              )}
            </div>
          )}

          {step === "importing" && (
            <div className="space-y-4 py-6">
              <p className="text-sm font-medium text-center">Importando produtos...</p>
              <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
              <p className="text-xs text-center text-muted-foreground">
                {progress.done.toLocaleString("pt-BR")} / {progress.total.toLocaleString("pt-BR")}
              </p>
            </div>
          )}

          {step === "done" && importSummary && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
                <p className="font-semibold">Importação concluída</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <StatCard label="Total analisado" value={importSummary.total} />
                <StatCard label="Importados" value={importSummary.inserted} tone="success" />
                <StatCard label="Duplicados / ignorados" value={importSummary.skippedExisting} tone="warn" />
                <StatCard label="Erros" value={importSummary.errors} tone="danger" />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {step === "select" && (
              <>
                <button
                  type="button"
                  onClick={() => handleOpenChange(false)}
                  className="h-10 px-4 rounded-lg border text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={!selectedFile || isAnalyzing}
                  className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Analisar planilha
                </button>
              </>
            )}

            {step === "preview" && (
              <>
                <button
                  type="button"
                  onClick={() => setStep("select")}
                  className="h-10 px-4 rounded-lg border text-sm font-medium"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={!canImport || isImporting}
                  className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
                >
                  Importar produtos válidos ({stats?.validRows ?? 0})
                </button>
              </>
            )}

            {step === "done" && (
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
              >
                Fechar
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "success" | "danger" | "warn";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-700"
      : tone === "danger"
        ? "text-destructive"
        : tone === "warn"
          ? "text-amber-700"
          : "text-foreground";

  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${toneClass}`}>{value.toLocaleString("pt-BR")}</p>
    </div>
  );
}

function StatusBadge({ row }: { row: ParsedImportRow }) {
  const label =
    row.status === "VALID"
      ? "Válida"
      : row.status === "INVALID"
        ? "Inválida"
        : row.status === "DUPLICATE"
          ? "Duplicada"
          : row.status === "DUPLICATE_EXISTING"
            ? "Já existe"
            : "Aviso";

  const className =
    row.status === "VALID"
      ? "text-emerald-700"
      : row.status === "DUPLICATE_EXISTING"
        ? "text-amber-700"
        : "text-destructive";

  return <span className={`text-xs font-semibold ${className}`}>{label}</span>;
}
