/**
 * Resolve the official PDF URL used by PDF.js.
 *
 * TJC does not expose browser CORS headers consistently, so the browser uses
 * the same-origin BFF when available. PDF.js then owns range loading; this
 * module deliberately does not prefetch or copy the whole document.
 */
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
