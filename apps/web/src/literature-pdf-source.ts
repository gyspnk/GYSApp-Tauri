import {
  extractOfficialPdfUrl,
  isOfficialPdfUrl,
  literatureIssuePostUrl,
} from "@gys/contracts/literature-source";
import { publicContentEndpoint } from "./pdf-source.js";

const CACHE_KEY = "gys-literature-pdf-sources-v1";
const MAX_AGE = 24 * 60 * 60_000;
const sources = new Map<string, { url: string; at: number }>();
const pending = new Map<string, Promise<string | undefined>>();
let hydrated = false;

export function getCachedIssuePdfUrl(source: string): string | undefined {
  if (!hydrated) {
    hydrated = true;
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(CACHE_KEY) ?? "[]",
      );
      if (Array.isArray(saved))
        for (const entry of saved.slice(-64)) {
          if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
          const value = entry[1];
          if (
            value &&
            typeof value.url === "string" &&
            isOfficialPdfUrl(value.url) &&
            typeof value.at === "number"
          )
            sources.set(entry[0], { url: value.url, at: value.at });
        }
    } catch {
      /* Storage is optional in embedded/private readers. */
    }
  }
  const cached = sources.get(source);
  if (cached && Date.now() - cached.at < MAX_AGE) return cached.url;
  sources.delete(source);
}

/** Share metadata work, persist only validated links, and never cache failures. */
export function resolveIssuePdfUrl(
  source: string,
): Promise<string | undefined> {
  const postUrl = literatureIssuePostUrl(source);
  if (!postUrl) return Promise.resolve(undefined);
  const cached = getCachedIssuePdfUrl(source);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(source);
  if (existing) return existing;
  const request = (async () => {
    let url: string | undefined;
    try {
      const response = await fetch(
        `${publicContentEndpoint("pdf-source")}?url=${encodeURIComponent(source)}`,
        {
          signal: AbortSignal.timeout(5_000),
          headers: { accept: "application/json" },
        },
      );
      const body: unknown = response.ok ? await response.json() : undefined;
      const candidate =
        body && typeof body === "object"
          ? (body as { url?: unknown }).url
          : undefined;
      if (typeof candidate === "string" && isOfficialPdfUrl(candidate))
        url = candidate;
    } catch {
      /* Older/offline workers can fall back to the public publisher. */
    }
    if (!url)
      try {
        const response = await fetch(postUrl, {
          signal: AbortSignal.timeout(8_000),
          headers: { accept: "application/json" },
        });
        if (response.ok)
          url = extractOfficialPdfUrl(await response.json(), source);
      } catch {
        /* The viewer provides a retry without resetting the application. */
      }
    if (url) {
      sources.delete(source);
      sources.set(source, { url, at: Date.now() });
      while (sources.size > 64) sources.delete(sources.keys().next().value!);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify([...sources]));
      } catch {
        /* Memory cache remains available. */
      }
    }
    return url;
  })().finally(() => pending.delete(source));
  pending.set(source, request);
  return request;
}
