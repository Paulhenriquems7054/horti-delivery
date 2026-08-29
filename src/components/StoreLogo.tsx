import { useEffect, useState } from "react";
import { DEFAULT_STORE_LOGO, resolveStoreLogoUrl } from "@/lib/storeLogo";

interface StoreLogoProps {
  logoPath?: string | null;
  /** Invalida cache do browser/CDN após novo upload (ex.: stores.updated_at) */
  logoVersion?: string | number | null;
  alt?: string;
  className?: string;
  imgClassName?: string;
}

export function StoreLogo({
  logoPath,
  logoVersion,
  alt = "Logo",
  className,
  imgClassName = "w-full h-full object-contain",
}: StoreLogoProps) {
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    setUseFallback(false);
  }, [logoPath, logoVersion]);

  const src = useFallback
    ? DEFAULT_STORE_LOGO
    : resolveStoreLogoUrl(logoPath, logoVersion);

  return (
    <div className={className}>
      <img
        key={`${logoPath ?? "default"}-${logoVersion ?? "0"}`}
        src={src}
        alt={alt}
        className={imgClassName}
        onError={() => setUseFallback(true)}
      />
    </div>
  );
}
