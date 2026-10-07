/**
 * Resolve the official PDF URL used by PDF.js.
 *
 * TJC does not expose browser CORS headers consistently, so the browser uses
 * the same-origin BFF when available. PDF.js then owns range loading; this
 * module deliberately does not prefetch or copy the whole document.
 */
import { isOfficialPdfUrl } from "@gys/contracts/literature-source";

/** Public content is available even in builds without optional login config. */
export function publicContentEndpoint(route: string): string {
  const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
  return `${base ? base.replace(/\/$/, "") : import.meta.env.DEV ? "" : "https://gysapp-tauri-bff.pas-presensi.workers.dev"}/api/v1/content/${route}`;
}

export function bffPdfUrl(sourceUrl: string): string {
  return isOfficialPdfUrl(sourceUrl)
    ? `${publicContentEndpoint("pdf")}?url=${encodeURIComponent(sourceUrl)}`
    : sourceUrl;
}
