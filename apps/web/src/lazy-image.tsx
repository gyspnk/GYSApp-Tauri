import { useEffect, useState } from "react";

export function resolveProxiedImageUrl(src?: string): string | undefined {
  if (!src) return undefined;
  if (src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("/"))
    return src;
  // <img> does not need CORS. Use the publisher's immutable S3 original
  // directly so the BFF cannot add a network hop or leave a resized derivative.
  try {
    const url = new URL(src);
    const stripWordPressSize = (pathname: string) =>
      pathname.replace(/-\d+x\d+(?=\.[^./]+$)/i, "");
    if (
      ["tjc.org", "www.tjc.org"].includes(url.hostname.toLowerCase()) &&
      url.pathname.startsWith("/id/wp-content/uploads/")
    ) {
      return `https://tjcorguploads.s3.amazonaws.com/tjcorg${stripWordPressSize(url.pathname.replace(/^\/id/, ""))}${url.search}`;
    }
    if (
      url.hostname.toLowerCase() === "tjcorguploads.s3.amazonaws.com" &&
      url.pathname.startsWith("/tjcorg/wp-content/uploads/")
    ) {
      url.pathname = stripWordPressSize(url.pathname);
      return url.toString();
    }
  } catch {
    return src;
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
  fetchPriority?: "high" | "low" | "auto" | undefined;
  onLoad?: (() => void) | undefined;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const effectiveSrc = resolveProxiedImageUrl(src);
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
  }, [effectiveSrc]);

  return (
    <div className={`img-skeleton-wrapper ${wrapperClassName}`}>
      {!loaded && !error && effectiveSrc && (
        <div className="img-skeleton-shimmer" aria-hidden="true">
          <div className="img-loading-bar" />
        </div>
      )}
      {!effectiveSrc || error ? (
        <div
          className="img-fallback-placeholder"
          role="img"
          aria-label={`Pratinjau tidak tersedia: ${alt}`}
        >
          <strong aria-hidden="true">{fallbackMark || "GYS"}</strong>
          {fallbackCategory && <small>{fallbackCategory}</small>}
        </div>
      ) : (
        <img
          src={effectiveSrc}
          alt={alt}
          className={`${className} img-with-skeleton ${loaded ? "is-loaded" : ""}`}
          loading={loading}
          decoding={decoding}
          fetchPriority={fetchPriority}
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
