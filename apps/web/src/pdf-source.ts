/**
 * PDF byte loading with layered CORS handling.
 *
 * tjc.org does not send `Access-Control-Allow-Origin`, so a browser fetch of
 * its PDFs fails when no same-origin/allowlisted proxy (BFF) is configured.
 * Layers:
 *  1. BFF `/api/v1/content/pdf` proxy (same-origin in production, ACAO set).
 *  2. Direct fetch when the origin happens to allow CORS.
 *  3. `no-cors` + Cache Storage: the opaque response can be stored, and modern
 *     browsers return a readable opaque-filtered response from `cache.match`.
 */
const REMOTE_PDF_CACHE = "gysapp-remote-pdf-cache";
const memory = new Map<string, Promise<Uint8Array | undefined>>();
const inFlight = new Map<string, Promise<Uint8Array | undefined>>();

function isTjcPdfSource(sourceUrl: string): boolean {
  try {
    const url = new URL(sourceUrl);
    return [
      "tjc.org",
      "www.tjc.org",
      "tjcorguploads.s3.amazonaws.com",
    ].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function bffPdfUrl(sourceUrl: string): string {
  const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
  const endpoint = base
    ? `${base.replace(/\/$/, "")}/api/v1/content/pdf`
    : import.meta.env.DEV &&
        typeof window !== "undefined" &&
        isTjcPdfSource(sourceUrl)
      ? "/api/v1/content/pdf"
      : undefined;
  return endpoint
    ? `${endpoint}?url=${encodeURIComponent(sourceUrl)}`
    : sourceUrl;
}

function isPdf(bytes: Uint8Array): boolean {
  return (
    bytes.length > 8 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"
  );
}

async function readOpaquePdf(url: string): Promise<Uint8Array | undefined> {
  if (typeof caches === "undefined") return undefined;
  try {
    const cache = await caches.open(REMOTE_PDF_CACHE);
    const cached = await cache.match(url);
    if (cached) {
      const blob = await cached.blob();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (isPdf(bytes)) return bytes;
    }
    const response = await fetch(url, { mode: "no-cors" });
    if (!response || response.type !== "opaque") return undefined;
    await cache.put(url, response);
    const stored = await cache.match(url);
    if (!stored) return undefined;
    const blob = await stored.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return isPdf(bytes) ? bytes : undefined;
  } catch {
    return undefined;
  }
}

export async function loadPdfBytes(
  url: string,
  signal?: AbortSignal,
): Promise<Uint8Array | undefined> {
  const cached = memory.get(url);
  if (cached) return cached;
  const existing = inFlight.get(url);
  if (existing) return existing;
  const task = (async () => {
    const proxy = bffPdfUrl(url);
    if (proxy !== url) {
      try {
        const response = await fetch(proxy, {
          cache: "default",
          ...(signal ? { signal } : {}),
        });
        if (response.ok) {
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (isPdf(bytes)) {
            memory.set(url, Promise.resolve(bytes));
            return bytes;
          }
        }
      } catch {
        // A configured BFF is the only browser-safe source for TJC PDFs.
      }
      // Do not retry the same stale URL directly: tjc.org does not grant CORS,
      // and that fallback only turns one useful error into several console
      // errors (CORS, 404 and opaque-cache failures).
      return undefined;
    }
    try {
      const response = await fetch(url, {
        cache: "default",
        ...(signal ? { signal } : {}),
      });
      if (response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (isPdf(bytes)) {
          memory.set(url, Promise.resolve(bytes));
          return bytes;
        }
      }
    } catch {
      // fall through to opaque path
    }
    const opaque = await readOpaquePdf(url);
    if (opaque) memory.set(url, Promise.resolve(opaque));
    return opaque;
  })();
  inFlight.set(url, task);
  void task.finally(() => inFlight.delete(url));
  return task;
}
