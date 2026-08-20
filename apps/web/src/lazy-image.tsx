import { useState } from "react";

export function LazyImage({
  src,
  alt,
  className = "",
  wrapperClassName = "",
  loading = "lazy",
  decoding = "async",
  onLoad,
}: {
  src?: string;
  alt: string;
  className?: string;
  wrapperClassName?: string;
  loading?: "eager" | "lazy";
  decoding?: "async" | "sync" | "auto";
  onLoad?: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div
        className={`img-skeleton-wrapper ${wrapperClassName}`}
        aria-hidden="true"
      >
        <div className="img-fallback-placeholder">
          <span>GYS</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`img-skeleton-wrapper ${wrapperClassName}`}>
      {!loaded && <div className="img-skeleton-shimmer" />}
      <img
        src={src}
        alt={alt}
        className={`${className} img-with-skeleton ${loaded ? "is-loaded" : ""}`}
        loading={loading}
        decoding={decoding}
        onLoad={() => {
          setLoaded(true);
          onLoad?.();
        }}
        onError={() => setError(true)}
      />
    </div>
  );
}
