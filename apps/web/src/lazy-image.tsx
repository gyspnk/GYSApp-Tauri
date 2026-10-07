import { useEffect, useRef, useState } from "react";
import { translate, type Locale } from "./i18n.js";
import { getCoverDataUri } from "./cover-generator.js";

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

function resolveOriginalImageUrl(
  src?: string,
  fullSize = false,
): string | undefined {
  if (!src) return undefined;
  if (src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("/"))
    return src;
  try {
    const url = new URL(src);
    const stripWordPressSize = (pathname: string) =>
      fullSize ? pathname.replace(/-\d+x\d+(?=\.[^./]+$)/i, "") : pathname;
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

export function LazyImage(props: Parameters<typeof ImageContent>[0]) {
  return <ImageContent key={props.src ?? ""} {...props} />;
}

function ImageContent({
  locale = "id",
  src,
  alt,
  className = "",
  wrapperClassName = "",
  loading = "lazy",
  decoding = "async",
  fallbackTitle,
  fallbackCategory,
  fallbackCategoryKey,
  fetchPriority,
  onLoad,
}: {
  locale?: Locale;
  src?: string | undefined;
  alt: string;
  className?: string | undefined;
  wrapperClassName?: string | undefined;
  loading?: "eager" | "lazy" | undefined;
  decoding?: "async" | "sync" | "auto" | undefined;
  fallbackTitle?: string | undefined;
  fallbackCategory?: string | undefined;
  fallbackCategoryKey?: string | undefined;
  fetchPriority?: "high" | "low" | "auto" | undefined;
  onLoad?: (() => void) | undefined;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const imageRef = useRef<HTMLImageElement>(null);
  const candidates = [
    ...new Set(
      [
        resolveProxiedImageUrl(src),
        resolveOriginalImageUrl(src),
        resolveOriginalImageUrl(src, true),
        src,
      ].filter((value): value is string => Boolean(value)),
    ),
  ];
  const effectiveSrc = candidates[attempt];
  const imageFailed = () => {
    if (attempt + 1 < candidates.length) {
      setLoaded(false);
      setAttempt(attempt + 1);
    } else setError(true);
  };
  const fallbackMark = (fallbackTitle ?? "GYS")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  useEffect(() => {
    const image = imageRef.current;
    // Cached images may finish before React observes the load event.
    setLoaded(Boolean(image?.complete && image.naturalWidth > 0));
    setError(false);
    if (image?.complete && image.currentSrc && image.naturalWidth === 0)
      imageFailed();
  }, [effectiveSrc]);

  useEffect(() => {
    if (!error) return;
    const retry = () => {
      setAttempt(0);
      setError(false);
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [error]);

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
          aria-label={translate(
            locale,
            error ? "image.previewError" : "image.previewMissing",
            { title: alt },
          )}
        >
          {fallbackTitle ? (
            <img
              className="img-fallback-art"
              src={getCoverDataUri({
                title: fallbackTitle,
                category: fallbackCategoryKey ?? fallbackCategory,
              })}
              alt=""
              aria-hidden="true"
            />
          ) : (
            <strong aria-hidden="true">{fallbackMark || "GYS"}</strong>
          )}
          {fallbackCategory && <small>{fallbackCategory}</small>}
        </div>
      ) : (
        <img
          ref={imageRef}
          src={effectiveSrc}
          alt={alt}
          className={`${className} img-with-skeleton ${loaded ? "is-loaded" : ""}`}
          loading={loading}
          decoding={decoding}
          fetchPriority={fetchPriority}
          onLoad={async (event) => {
            const image = event.currentTarget;
            // Reveal a decoded bitmap inside its reserved frame; its natural
            // dimensions never change the card's layout.
            await image.decode?.().catch(() => undefined);
            if (
              imageRef.current !== image ||
              (image.src !== effectiveSrc &&
                image.getAttribute("src") !== effectiveSrc)
            )
              return;
            setLoaded(true);
            setError(false);
            onLoad?.();
          }}
          onError={imageFailed}
        />
      )}
    </div>
  );
}
