import { useEffect, useState } from "react";

export function resolveProxiedImageUrl(src?: string): string | undefined {
  if (!src) return undefined;
  if (src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("/"))
    return src;
  const bffBase = (import.meta.env.VITE_BFF_BASE_URL ?? "").trim();
  if (src.includes("tjc.org") || src.includes("s3.amazonaws.com")) {
    if (!bffBase) return src;
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
  fallbackTitle,
  fallbackCategory,
  fallbackSrc,
  fetchPriority,
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
  fallbackSrc?: string | undefined;
  fetchPriority?: "high" | "low" | "auto" | undefined;
  onLoad?: (() => void) | undefined;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const effectiveSrc = resolveProxiedImageUrl(src);
  const effectiveFallbackSrc = resolveProxiedImageUrl(fallbackSrc);
  const fallbackMark = (fallbackTitle ?? "GYS")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  useEffect(() => {
    setLoaded(false);
    setError(false);
    setFallbackFailed(false);
  }, [effectiveFallbackSrc, effectiveSrc]);

  const fallbackActive =
    Boolean(effectiveFallbackSrc) && (!effectiveSrc || error);
  const displaySrc =
    fallbackActive && !fallbackFailed
      ? effectiveFallbackSrc
      : !error
        ? effectiveSrc
        : undefined;

  return (
    <div className={`img-skeleton-wrapper ${wrapperClassName}`}>
      {!loaded && !error && effectiveSrc && !fallbackActive && (
        <div className="img-skeleton-shimmer" aria-hidden="true">
          <div className="img-loading-bar" />
        </div>
      )}
      {effectiveSrc && !loaded && !error && effectiveFallbackSrc && (
        <img
          src={effectiveFallbackSrc}
          className="img-fallback-image"
          alt=""
          aria-hidden="true"
        />
      )}
      {!displaySrc && (
        <div
          className="img-fallback-placeholder"
          role="img"
          aria-label={`Pratinjau tidak tersedia: ${alt}`}
        >
          <strong aria-hidden="true">{fallbackMark || "GYS"}</strong>
          {fallbackCategory && <small>{fallbackCategory}</small>}
        </div>
      )}
      {displaySrc && (
        <img
          src={displaySrc}
          alt={alt}
          className={`${className} img-with-skeleton ${loaded || fallbackActive ? "is-loaded" : ""}`}
          loading={loading}
          decoding={decoding}
          fetchPriority={fetchPriority}
          onLoad={() => {
            setLoaded(true);
            if (!fallbackActive) setError(false);
            onLoad?.();
          }}
          onError={() => {
            if (fallbackActive) setFallbackFailed(true);
            else setError(true);
          }}
        />
      )}
    </div>
  );
}
