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

let feedCache: { expiresAt: number; items: SuaraSejatiPost[] } | undefined;
let feedInFlight: Promise<SuaraSejatiPost[]> | undefined;

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

export function parseSuaraSejati(value: unknown): SuaraSejatiPost[] {
  if (value && typeof value === "object" && "items" in value) {
    const feed = SuaraSejatiFeedSchema.safeParse(value);
    if (!feed.success) return [];
    return feed.data.items.flatMap((item) => {
      if (!isTjcUrl(item.url)) return [];
      const { imageUrl, ...rest } = item;
      return [isTjcUrl(imageUrl) ? { ...rest, imageUrl } : rest];
    });
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
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
    const imageUrl = isTjcUrl(candidateImageUrl)
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
    return {
      value: await response.json(),
      totalPages: Number(response.headers.get("x-wp-totalpages")),
    };
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

async function request(url: string, signal?: AbortSignal) {
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
  for (let page = 2; page <= totalPages; page += 1) {
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

export async function fetchSuara(
  signal?: AbortSignal,
): Promise<SuaraSejatiPost[]> {
  if (feedCache && feedCache.expiresAt > Date.now())
    return [...feedCache.items];
  if (feedInFlight) return [...(await waitFor(feedInFlight, signal))];
  const shared = (async () => {
    const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
    const isCrossPortLocalhost =
      typeof window !== "undefined" &&
      Boolean(
        base &&
        (base.includes("127.0.0.1") || base.includes("localhost")) &&
        !base.includes(`:${window.location.port}`),
      );
    const networkCandidates = [
      isCrossPortLocalhost
        ? undefined
        : `${(base ?? "").replace(/\/$/, "")}/api/v1/content/suara-sejati`,
      API_URL,
    ].filter((value): value is string => Boolean(value));
    const candidates =
      typeof navigator !== "undefined" && !navigator.onLine
        ? [STATIC_URL, ...networkCandidates]
        : [...networkCandidates, STATIC_URL];
    let lastError: unknown;
    for (const url of candidates) {
      try {
        const items = await request(url);
        if (items.length) return items;
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
  return undefined;
}
