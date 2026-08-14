import {
  SuaraSejatiFeedSchema,
  SuaraSejatiPostSchema,
  type SuaraSejatiPost,
} from "@gys/contracts";

const STATIC_URL = `${import.meta.env.BASE_URL}offline/suara-sejati.json`;
const API_URL =
  "https://tjc.org/id/wp-json/wp/v2/posts?categories=194&per_page=6&orderby=date&order=desc&_embed=wp:featuredmedia";

function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#8217;|&#39;|&apos;/gi, "'")
    .replace(/&#8230;|&hellip;/gi, "…")
    .replace(/\s+/g, " ")
    .trim();
}

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

export async function fetchSuara(
  signal?: AbortSignal,
): Promise<SuaraSejatiPost[]> {
  const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
  const networkCandidates = [
    base ? `${base.replace(/\/$/, "")}/api/v1/content/suara-sejati` : undefined,
    API_URL,
  ].filter((value): value is string => Boolean(value));
  const candidates =
    typeof navigator !== "undefined" && !navigator.onLine
      ? [STATIC_URL, ...networkCandidates]
      : [...networkCandidates, STATIC_URL];
  let lastError: unknown;
  for (const url of candidates) {
    try {
      const items = await request(url, signal);
      if (items.length) return items;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Suara Sejati is unavailable");
}
