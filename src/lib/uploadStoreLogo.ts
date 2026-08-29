import { supabase } from "@/integrations/supabase/client";
import {
  ALLOWED_STORE_LOGO_MIMES,
  buildStoreLogoPath,
  logoExtensionFromMime,
  MAX_STORE_LOGO_BYTES,
  STORE_LOGOS_BUCKET,
} from "@/lib/storeLogo";

export async function uploadStoreLogo(storeId: string, file: File): Promise<string> {
  if (!ALLOWED_STORE_LOGO_MIMES.includes(file.type as (typeof ALLOWED_STORE_LOGO_MIMES)[number])) {
    throw new Error("Formato inválido. Use PNG, JPG ou WEBP.");
  }
  if (file.size > MAX_STORE_LOGO_BYTES) {
    throw new Error("Arquivo muito grande. Máximo 2 MB.");
  }

  const ext = logoExtensionFromMime(file.type);
  if (!ext) throw new Error("Formato de imagem não suportado.");

  const path = buildStoreLogoPath(storeId, ext);

  const { error: uploadError } = await supabase.storage
    .from(STORE_LOGOS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) throw new Error("Falha ao enviar a imagem. Tente novamente.");

  const { error: rpcError } = await supabase.rpc("update_store_logo_path", {
    p_logo_path: path,
  });

  if (rpcError) throw new Error("Upload concluído, mas não foi possível vincular a logo à loja.");

  return path;
}

export async function removeStoreLogo(currentPath?: string | null): Promise<void> {
  if (currentPath?.trim()) {
    await supabase.storage.from(STORE_LOGOS_BUCKET).remove([currentPath]);
  }
  const { error } = await supabase.rpc("update_store_logo_path", { p_logo_path: null });
  if (error) throw new Error("Não foi possível remover a logomarca.");
}
