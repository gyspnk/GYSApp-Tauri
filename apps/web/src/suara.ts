import {
  SuaraSejatiFeedSchema,
  SuaraSejatiPostSchema,
  type SuaraSejatiPost,
} from "@gys/contracts";
import { recordDiagnostic } from "./diagnostics.js";
import { stripHtml } from "./sauh.js";

const STATIC_URL = `${import.meta.env.BASE_URL}offline/suara-sejati.json`;
const API_URL =
  "https://tjc.org/id/wp-json/wp/v2/posts?categories=194&per_page=100&orderby=date&order=desc&_embed=wp:featuredmedia";
const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const CACHE_TTL_MS = 5 * 60_000;
const PERSIST_KEY = "gys_suara_feed_v1";
// Bound the persistent archive so quota errors stay impossible while still
// keeping months of testimonies available for instant paint.
const MAX_PERSISTED_ITEMS = 400;

let feedCache: { expiresAt: number; items: SuaraSejatiPost[] } | undefined;
let feedInFlight: Promise<SuaraSejatiPost[]> | undefined;
let revalidateInFlight = false;

const SUARA_UPDATE_EVENT = "gys-suara-update";

/** Publishes incrementally merged feeds so open surfaces refresh without reloading. */
export function subscribeSuara(
  listener: (items: SuaraSejatiPost[]) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onUpdate = (event: Event) => {
    const items = (event as CustomEvent<SuaraSejatiPost[]>).detail;
    if (Array.isArray(items)) listener([...items]);
  };
  window.addEventListener(SUARA_UPDATE_EVENT, onUpdate);
  return () => window.removeEventListener(SUARA_UPDATE_EVENT, onUpdate);
}

function publishSuaraUpdate(items: SuaraSejatiPost[]) {
  if (
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function"
  )
    return;
  window.dispatchEvent(
    new CustomEvent<SuaraSejatiPost[]>(SUARA_UPDATE_EVENT, {
      detail: [...items],
    }),
  );
}

function persistedItems(value: unknown): SuaraSejatiPost[] | undefined {
  const candidates =
    value && typeof value === "object" && "items" in value
      ? (value as { items?: unknown }).items
      : value;
  if (!Array.isArray(candidates)) return undefined;
  const parsed = parseSuaraSejati(candidates);
  return parsed.length ? parsed : undefined;
}

function readPersistedSuara(): SuaraSejatiPost[] | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    if (!window.localStorage) return undefined;
    const raw = window.localStorage.getItem(PERSIST_KEY);
    if (!raw) return undefined;
    return persistedItems(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

function persistSuara(items: SuaraSejatiPost[]) {
  if (typeof window === "undefined") return;
  try {
    if (!window.localStorage) return;
    window.localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({
        fetchedAt: new Date().toISOString(),
        items: items.slice(0, MAX_PERSISTED_ITEMS),
      }),
    );
  } catch {
    // ignore storage quota errors
  }
}

function sortByNewest(items: SuaraSejatiPost[]): SuaraSejatiPost[] {
  return [...items].sort((left, right) =>
    right.publishedAt.localeCompare(left.publishedAt),
  );
}

/**
 * Union merge keyed by post id: cached entries stay, upstream additions are
 * appended without re-rendering the whole shelf.
 */
function mergeSuaraFeeds(
  current: SuaraSejatiPost[],
  incoming: SuaraSejatiPost[],
): SuaraSejatiPost[] | undefined {
  if (!incoming.length) return undefined;
  const merged = new Map<string, SuaraSejatiPost>();
  for (const item of current) merged.set(item.id, item);
  let added = false;
  for (const item of incoming) {
    if (!merged.has(item.id)) added = true;
    merged.set(item.id, item);
  }
  if (!added && merged.size === current.length) return undefined;
  const next = sortByNewest([...merged.values()]).slice(
    0,
    Math.max(MAX_PERSISTED_ITEMS, current.length),
  );
  if (
    next.length === current.length &&
    next.every((item, index) => item.id === current[index]?.id)
  )
    return undefined;
  return next;
}

function suaraNetworkCandidates(): string[] {
  const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
  const isCrossPortLocalhost =
    typeof window !== "undefined" &&
    Boolean(
      base &&
      (base.includes("127.0.0.1") || base.includes("localhost")) &&
      !base.includes(`:${window.location.port}`),
    );
  const proxy = isCrossPortLocalhost
    ? undefined
    : `${(base ?? "").replace(/\/$/, "")}/api/v1/content/suara-sejati`;
  return [
    proxy,
    API_URL,
  ].filter((value): value is string => Boolean(value));
}

/** The publisher mirrors featured images on an official S3 bucket. */
const TJC_IMAGE_HOSTS = [
  "tjc.org",
  "www.tjc.org",
  "tjcorguploads.s3.amazonaws.com",
];

function isTjcUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      ["tjc.org", "www.tjc.org"].includes(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

function isTjcImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      TJC_IMAGE_HOSTS.includes(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

export function parseSuaraSejati(value: unknown): SuaraSejatiPost[] {
  if (value && typeof value === "object" && "items" in value) {
    const feed = SuaraSejatiFeedSchema.safeParse(value);
    if (!feed.success) return [];
    return feed.data.items.flatMap((item) => {
      if (!isTjcUrl(item.url)) return [];
      if (item.imageUrl && !isTjcImageUrl(item.imageUrl)) return [];
      return [item];
    });
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown): SuaraSejatiPost[] => {
    if (!item || typeof item !== "object") return [];
    const direct = SuaraSejatiPostSchema.safeParse(item);
    if (direct.success && isTjcUrl(direct.data.url)) {
      if (direct.data.imageUrl && !isTjcImageUrl(direct.data.imageUrl)) {
        const { imageUrl: _, ...rest } = direct.data;
        return [rest];
      }
      return [direct.data];
    }
    const post = item as {
      id?: unknown;
      slug?: unknown;
      date?: unknown;
      link?: unknown;
      title?: { rendered?: unknown };
      excerpt?: { rendered?: unknown };
      _embedded?: {
        [key: string]: Array<{ source_url?: unknown }> | undefined;
      };
    };
    const title =
      typeof post.title?.rendered === "string"
        ? stripHtml(post.title.rendered)
        : "";
    const excerpt =
      typeof post.excerpt?.rendered === "string"
        ? stripHtml(post.excerpt.rendered)
        : "";
    const parsedDate =
      typeof post.date === "string" ? new Date(post.date) : undefined;
    const publishedAt =
      parsedDate && !Number.isNaN(parsedDate.getTime())
        ? parsedDate.toISOString()
        : "";
    const url = typeof post.link === "string" ? post.link : "";
    const candidateImageUrl =
      post._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
    const imageUrl = isTjcImageUrl(candidateImageUrl)
      ? candidateImageUrl
      : undefined;
    if (!isTjcUrl(url) || !publishedAt) return [];
    const result = SuaraSejatiPostSchema.safeParse({
      id:
        typeof post.slug === "string"
          ? post.slug
          : `suara-${String(post.id ?? "item")}`,
      title,
      excerpt,
      url,
      ...(imageUrl ? { imageUrl } : {}),
      publishedAt,
      source: "tjc.org",
    });
    return result.success ? [result.data] : [];
  });
}

function isWordPressFeed(url: string): boolean {
  try {
    return new URL(url, window.location.href).pathname.includes(
      "/wp-json/wp/v2/posts",
    );
  } catch {
    return false;
  }
}

function pageUrl(url: string, page: number): string {
  const next = new URL(url, window.location.href);
  next.searchParams.set("page", String(page));
  next.searchParams.set("per_page", String(PAGE_SIZE));
  return next.toString();
}

async function requestPage(url: string, signal?: AbortSignal) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 4_000);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url, {
      // BFF serves max-age=300 + stale-while-revalidate: reuse the HTTP cache
      // inside the freshness window instead of revalidating on every open.
      cache: "default",
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(`Suara Sejati request failed: ${response.status}`);
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("text/html"))
      throw new Error(`Expected JSON from ${url}, got HTML`);
    return {
      value: await response.json(),
      totalPages: Number(response.headers.get("x-wp-totalpages")),
    };
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

async function request(
  url: string,
  signal?: AbortSignal,
  options?: { maxPages?: number },
) {
  if (!isWordPressFeed(url))
    return parseSuaraSejati((await requestPage(url, signal)).value);

  const first = await requestPage(pageUrl(url, 1), signal);
  const items = parseSuaraSejati(first.value);
  const sourceCount = Array.isArray(first.value) ? first.value.length : 0;
  const hasPageHeader =
    Number.isInteger(first.totalPages) && first.totalPages > 0;
  let totalPages = hasPageHeader
    ? first.totalPages
    : sourceCount < PAGE_SIZE
      ? 1
      : 2;
  if (totalPages > MAX_PAGES)
    throw new Error("Suara Sejati source returned too many pages");
  const allItems = [...items];
  // Revalidation only needs the newest additions (page 1); full pagination
  // stays reserved for the cold first fill when no cache exists yet.
  const limit = Math.max(
    1,
    Math.min(totalPages, options?.maxPages ?? MAX_PAGES),
  );
  for (let page = 2; page <= limit; page += 1) {
    const next = await requestPage(pageUrl(url, page), signal);
    allItems.push(...parseSuaraSejati(next.value));
    if (hasPageHeader) continue;
    const nextPageHeader =
      Number.isInteger(next.totalPages) && next.totalPages > 0;
    if (nextPageHeader) {
      if (next.totalPages > MAX_PAGES)
        throw new Error("Suara Sejati source returned too many pages");
      totalPages = next.totalPages;
    } else if (!Array.isArray(next.value) || next.value.length < PAGE_SIZE) {
      break;
    } else {
      totalPages = page + 1;
    }
  }
  return allItems;
}

export async function fetchSuaraSnapshot(
  signal?: AbortSignal,
): Promise<SuaraSejatiPost[]> {
  return request(STATIC_URL, signal);
}

function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted)
    return Promise.reject(signal.reason ?? new Error("Request aborted"));
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(signal.reason ?? new Error("Request aborted"));
    };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

/**
 * Background revalidation: only the newest additions are fetched (page 1 of
 * the publisher feed) and union-merged into the persisted cache, so revisits
 * paint instantly and update incrementally instead of reloading everything.
 */
function scheduleSuaraRevalidate() {
  if (revalidateInFlight) return;
  if (!feedCache || !feedCache.items.length) return;
  if (feedCache.expiresAt > Date.now()) return;
  revalidateInFlight = true;
  // Off the paint path: refreshing never blocks first render.
  const delay =
    typeof window !== "undefined" && typeof window.setTimeout === "function"
      ? (callback: () => void) => window.setTimeout(callback, 50)
      : (callback: () => void) => setTimeout(callback, 50);
  delay(() => {
    void (async () => {
      try {
        const current = [...(feedCache?.items ?? [])];
        for (const url of suaraNetworkCandidates()) {
          try {
            // Cross-origin browser reads cannot rely on pagination headers
            // from every origin; page 1 carries the newest posts either way.
            const incoming = await request(url, undefined, { maxPages: 1 });
            const merged = mergeSuaraFeeds(current, incoming);
            if (merged) {
              feedCache = {
                expiresAt: Date.now() + CACHE_TTL_MS,
                items: merged,
              };
              persistSuara(merged);
              publishSuaraUpdate(merged);
            } else if (feedCache) {
              feedCache.expiresAt = Date.now() + CACHE_TTL_MS;
            }
            return;
          } catch {
            // try the next candidate
          }
        }
      } finally {
        revalidateInFlight = false;
      }
    })();
  });
}

export async function fetchSuara(
  signal?: AbortSignal,
): Promise<SuaraSejatiPost[]> {
  const hydrated = readPersistedSuara();
  if ((!feedCache || !feedCache.items.length) && hydrated?.length) {
    feedCache = { expiresAt: 0, items: [...hydrated] };
  }
  if (feedCache && feedCache.items.length) {
    const items = [...feedCache.items];
    scheduleSuaraRevalidate();
    return items;
  }
  if (feedInFlight) return [...(await waitFor(feedInFlight, signal))];
  const shared = (async () => {
    const candidates =
      typeof navigator !== "undefined" && !navigator.onLine
        ? [STATIC_URL]
        : [...suaraNetworkCandidates(), STATIC_URL];
    let lastError: unknown;
    for (const url of candidates) {
      try {
        const items = await request(url);
        if (items.length)
          return sortByNewest(items).slice(0, MAX_PERSISTED_ITEMS);
      } catch (error) {
        lastError = error;
      }
    }
    const failure =
      lastError instanceof Error
        ? lastError
        : new Error("Suara Sejati is unavailable");
    recordDiagnostic("error", "suara.fetch", failure);
    throw failure;
  })();
  const tracked = shared.then(
    (items) => {
      feedCache = { expiresAt: Date.now() + CACHE_TTL_MS, items: [...items] };
      persistSuara(items);
      publishSuaraUpdate(items);
      return items;
    },
    (error: unknown) => {
      throw error;
    },
  );
  feedInFlight = tracked;
  void tracked.then(
    () => {
      if (feedInFlight === tracked) feedInFlight = undefined;
    },
    () => {
      if (feedInFlight === tracked) feedInFlight = undefined;
    },
  );
  return [...(await waitFor(tracked, signal))];
}

export function getCachedSuara(): SuaraSejatiPost[] | undefined {
  if (feedCache && feedCache.items.length) {
    return [...feedCache.items];
  }
  const hydrated = readPersistedSuara();
  if (hydrated?.length) {
    feedCache = { expiresAt: 0, items: [...hydrated] };
    scheduleSuaraRevalidate();
    return [...hydrated];
  }
  return undefined;
}
