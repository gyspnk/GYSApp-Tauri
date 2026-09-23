import { useEffect, useState } from "react";

export type LazyImageState = "loading" | "loaded" | "missing" | "error";

export function getLazyImageState(
  src: string | undefined,
  loaded: boolean,
  error: boolean,
): LazyImageState {
  if (!src) return "missing";
  if (error) return "error";
  return loaded ? "loaded" : "loading";
}

function resolveOriginalImageUrl(src?: string): string | undefined {
  if (!src) return undefined;
  if (src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("/"))
    return src;
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

function imageProxyBase(): string | undefined {
  const configured = import.meta.env.VITE_BFF_BASE_URL?.trim();
  const isCrossPortLocalhost =
    typeof window !== "undefined" &&
    Boolean(
      configured &&
      (configured.includes("127.0.0.1") || configured.includes("localhost")) &&
      !configured.includes(`:${window.location.port}`),
    );
  if (configured && !isCrossPortLocalhost) return configured;
  if (import.meta.env.DEV && typeof window !== "undefined") {
    return window.location.origin;
  }
  return undefined;
}

export function resolveProxiedImageUrl(src?: string): string | undefined {
  const original = resolveOriginalImageUrl(src);
  if (!original || original.startsWith("data:") || original.startsWith("blob:"))
    return original;
  const proxyBase = imageProxyBase();
  if (!proxyBase || !/^https:\/\//i.test(original)) return original;
  const proxy = new URL("/api/v1/content/image", proxyBase);
  proxy.searchParams.set("url", original);
  return proxy.toString();
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

  const imageState = getLazyImageState(effectiveSrc, loaded, error);

  return (
    <div
      className={`img-skeleton-wrapper ${wrapperClassName}`}
      data-image-state={imageState}
      aria-busy={imageState === "loading"}
    >
      {!loaded && !error && effectiveSrc && (
        <div className="img-skeleton-shimmer" aria-hidden="true">
          <div className="img-loading-bar" />
        </div>
      )}
      {!effectiveSrc || error ? (
        <div
          className={`img-fallback-placeholder ${error ? "is-error" : "is-missing"}`}
          role="img"
          aria-label={`${error ? "Gagal memuat pratinjau" : "Pratinjau tidak tersedia"}: ${alt}`}
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
