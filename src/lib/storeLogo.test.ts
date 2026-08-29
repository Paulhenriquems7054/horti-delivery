import { describe, expect, it } from "vitest";
import {
  buildStoreLogoPath,
  DEFAULT_STORE_LOGO,
  isValidStoreLogoPath,
  logoExtensionFromMime,
  resolveStoreLogoUrl,
} from "@/lib/storeLogo";

describe("storeLogo", () => {
  const storeId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

  it("retorna logo padrão quando logo_path é nulo", () => {
    expect(resolveStoreLogoUrl(null)).toBe(DEFAULT_STORE_LOGO);
    expect(resolveStoreLogoUrl("")).toBe(DEFAULT_STORE_LOGO);
  });

  it("valida path por store_id", () => {
    const path = buildStoreLogoPath(storeId, "png");
    expect(isValidStoreLogoPath(path, storeId)).toBe(true);
    expect(isValidStoreLogoPath(path, "other-store-id")).toBe(false);
  });

  it("aceita mime types de imagem suportados", () => {
    expect(logoExtensionFromMime("image/png")).toBe("png");
    expect(logoExtensionFromMime("image/jpeg")).toBe("jpg");
    expect(logoExtensionFromMime("image/webp")).toBe("webp");
    expect(logoExtensionFromMime("application/pdf")).toBeNull();
  });
});
