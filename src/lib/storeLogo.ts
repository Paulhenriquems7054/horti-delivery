import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_STORE_LOGO = "/play_store_512.png";
export const STORE_LOGOS_BUCKET = "store-logos";

const ALLOWED_LOGO_PREFIX = "logos/";

export function isValidStoreLogoPath(logoPath: string, storeId: string): boolean {
  return logoPath.startsWith(`${ALLOWED_LOGO_PREFIX}${storeId}/`);
}

export function resolveStoreLogoUrl(logoPath?: string | null): string {
  if (!logoPath?.trim()) return DEFAULT_STORE_LOGO;
  const { data } = supabase.storage.from(STORE_LOGOS_BUCKET).getPublicUrl(logoPath);
  return data.publicUrl || DEFAULT_STORE_LOGO;
}

export function logoExtensionFromMime(mime: string): "png" | "jpg" | "webp" | null {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

export function buildStoreLogoPath(storeId: string, ext: "png" | "jpg" | "webp"): string {
  return `${ALLOWED_LOGO_PREFIX}${storeId}/logo.${ext}`;
}

export const MAX_STORE_LOGO_BYTES = 2 * 1024 * 1024;
export const ALLOWED_STORE_LOGO_MIMES = ["image/png", "image/jpeg", "image/jpg", "image/webp"] as const;
