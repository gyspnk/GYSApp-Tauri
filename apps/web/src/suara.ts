import {
  SuaraSejatiFeedSchema,
  SuaraSejatiPostSchema,
  type SuaraSejatiPost,
} from "@gys/contracts";
import { stripHtml } from "./sauh.js";

const STATIC_URL = `${import.meta.env.BASE_URL}offline/suara-sejati.json`;
const API_URL =
  "https://tjc.org/id/wp-json/wp/v2/posts?categories=194&per_page=6&orderby=date&order=desc&_embed=wp:featuredmedia";
const CACHE_TTL_MS = 5 * 60_000;

let feedCache: { expiresAt: number; items: SuaraSejatiPost[] } | undefined;
let feedInFlight: Promise<SuaraSejatiPost[]> | undefined;

function parse(value: unknown): SuaraSejatiPost[] {
  if (value && typeof value === "object" && "items" in value) {
    const feed = SuaraSejatiFeedSchema.safeParse(value);
    return feed.success ? feed.data.items : [];
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
    const publishedAt =
      typeof post.date === "string" ? new Date(post.date).toISOString() : "";
    const url = typeof post.link === "string" ? post.link : "";
    const imageUrl = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
    const result = SuaraSejatiPostSchema.safeParse({
      id:
        typeof post.slug === "string"
          ? post.slug
          : `suara-${String(post.id ?? "item")}`,
      title,
      excerpt,
      url,
      ...(typeof imageUrl === "string" && imageUrl.startsWith("http")
        ? { imageUrl }
        : {}),
      publishedAt,
      source: "tjc.org",
    });
    return result.success ? [result.data] : [];
  });
}

async function request(url: string, signal?: AbortSignal) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 4_000);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url, {
      cache: "no-cache",
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(`Suara Sejati request failed: ${response.status}`);
    return parse(await response.json());
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
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
    const networkCandidates = [
      base
        ? `${base.replace(/\/$/, "")}/api/v1/content/suara-sejati`
        : undefined,
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
    throw lastError instanceof Error
      ? lastError
      : new Error("Suara Sejati is unavailable");
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
