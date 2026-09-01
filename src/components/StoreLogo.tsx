import { useEffect, useState } from "react";
import { DEFAULT_STORE_LOGO, resolveStoreLogoUrl } from "@/lib/storeLogo";
import { cn } from "@/lib/utils";

interface StoreLogoProps {
  logoPath?: string | null;
  /** Invalida cache do browser/CDN após novo upload (ex.: stores.updated_at) */
  logoVersion?: string | number | null;
  alt?: string;
  className?: string;
  imgClassName?: string;
  /** Ajuste fino quando a arte não ocupa o centro do arquivo (ex.: "center 35%") */
  objectPosition?: string;
}

export function StoreLogo({
  logoPath,
  logoVersion,
  alt = "Logo",
  className,
  imgClassName = "h-full w-full object-contain",
  objectPosition,
}: StoreLogoProps) {
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    setUseFallback(false);
  }, [logoPath, logoVersion]);

  const src = useFallback
    ? DEFAULT_STORE_LOGO
    : resolveStoreLogoUrl(logoPath, logoVersion);

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <img
        key={`${logoPath ?? "default"}-${logoVersion ?? "0"}`}
        src={src}
        alt={alt}
        className={imgClassName}
        style={objectPosition ? { objectPosition } : undefined}
        onError={() => setUseFallback(true)}
      />
    </div>
  );
}
