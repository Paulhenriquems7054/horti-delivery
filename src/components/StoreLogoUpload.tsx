import { useRef, useState } from "react";
import { Loader2, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StoreLogo } from "@/components/StoreLogo";
import { uploadStoreLogo } from "@/lib/uploadStoreLogo";
import { toast } from "sonner";

interface Props {
  storeId: string;
  storeName: string;
  logoPath?: string | null;
  onUpdated: () => void;
}

export function StoreLogoUpload({ storeId, storeName, logoPath, onUpdated }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleSelect = async (file: File | undefined) => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setUploading(true);
    try {
      await uploadStoreLogo(storeId, file);
      toast.success("Logomarca salva com sucesso!");
      setPreviewUrl(null);
      onUpdated();
    } catch (err) {
      setPreviewUrl(null);
      toast.error(err instanceof Error ? err.message : "Erro ao salvar logomarca");
    } finally {
      setUploading(false);
      URL.revokeObjectURL(objectUrl);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div>
        <p className="text-sm font-bold text-foreground">Identidade da loja</p>
        <p className="text-xs text-muted-foreground">Logomarca exibida na vitrine e no painel da loja.</p>
      </div>
      <div className="flex items-center gap-4">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Prévia da logomarca"
            className="h-16 w-16 rounded-xl object-contain border bg-muted p-1 shrink-0"
          />
        ) : (
          <StoreLogo
            logoPath={logoPath}
            alt={storeName}
            className="h-16 w-16 rounded-xl bg-muted flex items-center justify-center overflow-hidden p-2 shrink-0"
          />
        )}
        <div className="flex-1 space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => void handleSelect(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ImageIcon className="h-4 w-4 mr-2" />
            )}
            {uploading ? "Salvando…" : "Selecionar imagem"}
          </Button>
          <p className="text-[11px] text-muted-foreground">PNG, JPG ou WEBP · máx. 2 MB</p>
        </div>
      </div>
    </div>
  );
}
