import { useEffect, useState } from "react";

export function resolveProxiedImageUrl(src?: string): string | undefined {
  if (!src) return undefined;
  if (src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("/"))
    return src;
  const bffBase = (import.meta.env.VITE_BFF_BASE_URL ?? "").trim();
  if (src.includes("tjc.org") || src.includes("s3.amazonaws.com")) {
    const base = bffBase.replace(/\/$/, "");
    return `${base}/api/v1/content/image?url=${encodeURIComponent(src)}`;
  }
  return src;
}

export function LazyImage({
  src,
  alt,
  className = "",
  wrapperClassName = "",
  loading = "lazy",
  decoding = "async",
  onLoad,
}: {
  src?: string | undefined;
  alt: string;
  className?: string | undefined;
  wrapperClassName?: string | undefined;
  loading?: "eager" | "lazy" | undefined;
  decoding?: "async" | "sync" | "auto" | undefined;
  fallbackTitle?: string | undefined;
  fallbackCategory?: string | undefined;
  onLoad?: (() => void) | undefined;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const effectiveSrc = resolveProxiedImageUrl(src);

  useEffect(() => {
    setLoaded(false);
    setError(false);
  }, [effectiveSrc]);

  return (
    <div className={`img-skeleton-wrapper ${wrapperClassName}`}>
      {(!loaded || error) && (
        <div className="img-skeleton-shimmer" aria-hidden="true">
          <div className="img-loading-bar" />
        </div>
      )}
      {effectiveSrc && (
        <img
          src={effectiveSrc}
          alt={alt}
          className={`${className} img-with-skeleton ${loaded && !error ? "is-loaded" : ""}`}
          loading={loading}
          decoding={decoding}
          onLoad={() => {
            setLoaded(true);
            setError(false);
            onLoad?.();
          }}
          onError={() => {
            setError(true);
          }}
        />
      )}
    </div>
  );
}



