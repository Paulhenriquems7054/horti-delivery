import { useState } from "react";
import { DEFAULT_STORE_LOGO, resolveStoreLogoUrl } from "@/lib/storeLogo";

interface StoreLogoProps {
  logoPath?: string | null;
  alt?: string;
  className?: string;
  imgClassName?: string;
}

export function StoreLogo({
  logoPath,
  alt = "Logo",
  className,
  imgClassName = "w-full h-full object-contain",
}: StoreLogoProps) {
  const [useFallback, setUseFallback] = useState(false);
  const src = useFallback ? DEFAULT_STORE_LOGO : resolveStoreLogoUrl(logoPath);

  return (
    <div className={className}>
      <img
        src={src}
        alt={alt}
        className={imgClassName}
        onError={() => setUseFallback(true)}
      />
    </div>
  );
}
