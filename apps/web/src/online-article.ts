import { OnlineArticleSchema, type OnlineArticle } from "@gys/contracts";
import { stripHtml } from "./sauh.js";
import { recordDiagnostic } from "./diagnostics.js";

function isSuaraContent(html: string, url?: string): boolean {
  const lowerHtml = html.toLowerCase();
  const lowerUrl = url?.toLowerCase() ?? "";
  return lowerHtml.includes("tb_qnx359") || lowerUrl.includes("suarasejati");
}

function extractSuaraBodyHtml(html: string): string {
  let working = html;

  const cutoffPatterns: RegExp[] = [
    /<div[^>]*class="[^"]*tb_bve9352[^"]*"[^>]*>/i,
    /<div[^>]*class="[^"]*module-post[^"]*tb_w1on855[^"]*"[^>]*>/i,
    /<div[^>]*class="[^"]*pagenav[^"]*"[^>]*>/i,
    /<div[^>]*class="[^"]*builder-posts-wrap[^"]*"[^>]*>/i,
  ];
  let earliest = working.length;
  for (const re of cutoffPatterns) {
    const match = working.match(re);
    if (match?.index !== undefined && match.index < earliest) {
      earliest = match.index;
    }
  }
  if (earliest !== working.length) {
    working = working.slice(0, earliest);
  } else {
    const fancyIdx = working.search(
      /Suara\s+Sejati[\s\S]{0,300}?Lihat\s+Semua/i,
    );
    if (fancyIdx >= 0) working = working.slice(0, fancyIdx);
  }

  const bylineMatch = working.match(
    /<div[^>]*class="[^"]*tb_1uj5387[^"]*"[^>]*>[\s\S]*?<div[^>]*class="[^"]*tb_text_wrap[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
  );
  const qnxMatch = working.match(
    /<div[^>]*class="[^"]*tb_qnx359[^"]*"[^>]*>[\s\S]*?<div[^>]*class="[^"]*tb_text_wrap[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
  );
  if (qnxMatch?.[1]) {
    const main = qnxMatch[1];
    if (bylineMatch?.[1]) {
      const bylineText = stripHtml(bylineMatch[1]).trim();
      if (bylineText && bylineText.length < 200) {
        return `${bylineMatch[1]}\n${main}`;
      }
    }
    return main;
  }

  const textWrapIdx = working.toLowerCase().indexOf("tb_text_wrap");
  if (textWrapIdx >= 0) {
    const after = working.slice(textWrapIdx);
    const pIdx = after.search(/<p[^>]*>/i);
    if (pIdx >= 0) {
      return after.slice(pIdx);
    }
  }
  return working;
}

function cleanSuaraRawContent(html: string, url?: string): string {
  if (!isSuaraContent(html, url)) return html;
  return extractSuaraBodyHtml(html);
}

function bffUrl(url: string): string {
  const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
  if (!base) throw new Error("BFF artikel belum dikonfigurasi");
  return `${base.replace(/\/$/, "")}/api/v1/content/article?url=${encodeURIComponent(url)}`;
}

const articleMemoryCache = new Map<string, OnlineArticle>();
const ARTICLE_MEMORY_ENTRIES = 32;
const ARTICLE_MEMORY_BYTES = 4 * 1024 * 1024;
let articleMemoryBytes = 0;
const ARTICLE_STORAGE_PREFIX = "gys_article_cache_";
// Refresh after 24 hours, retaining the last good body for offline reading.
const ARTICLE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function isExpiredArticle(article: OnlineArticle): boolean {
  const age = Date.now() - Date.parse(article.fetchedAt);
  return (
    !Number.isFinite(age) || age < -5 * 60 * 1000 || age > ARTICLE_CACHE_TTL_MS
  );
}

function isStaleSuaraCache(article: OnlineArticle): boolean {
  if (!article.url.toLowerCase().includes("suarasejati")) return false;
  return (
    article.body.includes("Lihat Semua") ||
    /\b1\s+2\s+3\s+4\b/.test(article.body) ||
    article.body.includes("https://tjc.org/id/wp-content/uploads")
  );
}

function articleBytes(article: OnlineArticle): number {
  return (
    2 *
    (article.body.length +
      article.title.length +
      article.url.length +
      article.id.length +
      article.source.length +
      article.fetchedAt.length)
  );
}

function forgetArticle(url: string): void {
  const previous = articleMemoryCache.get(url);
  if (previous) articleMemoryBytes -= articleBytes(previous);
  articleMemoryCache.delete(url);
}

function rememberArticle(url: string, article: OnlineArticle): void {
  forgetArticle(url);
  const bytes = articleBytes(article);
  if (bytes > ARTICLE_MEMORY_BYTES) return;
  articleMemoryCache.set(url, article);
  articleMemoryBytes += bytes;
  while (
    articleMemoryCache.size > ARTICLE_MEMORY_ENTRIES ||
    articleMemoryBytes > ARTICLE_MEMORY_BYTES
  ) {
    const oldest = articleMemoryCache.keys().next().value;
    if (oldest === undefined) break;
    forgetArticle(oldest);
  }
}

function removeStoredArticle(
  url: string,
  names: ReadonlyArray<"localStorage" | "sessionStorage"> = [
    "localStorage",
    "sessionStorage",
  ],
): void {
  if (typeof window === "undefined") return;
  for (const name of names) {
    try {
      window[name].removeItem(`${ARTICLE_STORAGE_PREFIX}${url}`);
    } catch {
      /* Storage can be disabled. */
    }
  }
}

export function getCachedArticle(url: string): OnlineArticle | undefined {
  const mem = articleMemoryCache.get(url);
  if (mem) {
    if (!isStaleSuaraCache(mem)) {
      rememberArticle(url, mem);
      return mem;
    }
    forgetArticle(url);
    removeStoredArticle(url);
    return undefined;
  }
  if (typeof window === "undefined") return undefined;
  let stored: OnlineArticle | undefined;
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      const raw = window[name].getItem(`${ARTICLE_STORAGE_PREFIX}${url}`);
      if (!raw) continue;
      const parsed = OnlineArticleSchema.safeParse(JSON.parse(raw));
      if (
        !parsed.success ||
        parsed.data.url !== url ||
        isStaleSuaraCache(parsed.data)
      ) {
        removeStoredArticle(url, [name]);
        continue;
      }
      if (
        !stored ||
        Date.parse(parsed.data.fetchedAt) > Date.parse(stored.fetchedAt)
      )
        stored = parsed.data;
    } catch (error) {
      if (error instanceof SyntaxError) removeStoredArticle(url, [name]);
      // Try the session fallback when persistent storage is unavailable.
    }
  }
  if (stored) rememberArticle(url, stored);
  return stored;
}

function setCachedArticle(url: string, article: OnlineArticle) {
  rememberArticle(url, article);
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(article);
  try {
    window.localStorage.setItem(`${ARTICLE_STORAGE_PREFIX}${url}`, serialized);
    try {
      window.sessionStorage.removeItem(`${ARTICLE_STORAGE_PREFIX}${url}`);
    } catch {
      /* Best effort migration. */
    }
    return;
  } catch {
    // Keep a session fallback only when persistent storage is unavailable/full.
  }
  try {
    window.sessionStorage.setItem(
      `${ARTICLE_STORAGE_PREFIX}${url}`,
      serialized,
    );
  } catch {
    // ignore quota error
  }
}

export async function fetchOnlineArticle(
  url: string,
  signal?: AbortSignal,
): Promise<OnlineArticle> {
  signal?.throwIfAborted();
  const cached = getCachedArticle(url);
  if (cached && !isExpiredArticle(cached)) return cached;

  const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
  if (base) {
    try {
      const response = await fetch(bffUrl(url), {
        ...(signal ? { signal } : {}),
        credentials: "omit",
        cache: "default",
      });
      if (response.ok) {
        const payload: unknown = await response.json();
        signal?.throwIfAborted();
        const parsed = OnlineArticleSchema.safeParse(payload);
        if (parsed.success) {
          setCachedArticle(url, parsed.data);
          return parsed.data;
        }
      }
    } catch (error) {
      signal?.throwIfAborted();
      recordDiagnostic("warn", "article.bff", error);
    }
  }

  // Direct / fallback reader using the allowlisted WordPress endpoint
  const source = new URL(url);
  if (
    source.protocol !== "https:" ||
    !["tjc.org", "www.tjc.org"].includes(source.hostname.toLowerCase())
  )
    throw new Error("Article source is not allowlisted");

  const rawSlug = source.pathname.split("/").filter(Boolean).pop();
  if (!rawSlug) throw new Error("Article slug is missing");
  const slug = decodeURIComponent(rawSlug);

  // 1. Primary: fetch by slug
  try {
    const endpoint = new URL("https://tjc.org/id/wp-json/wp/v2/posts");
    endpoint.searchParams.set("slug", slug);
    endpoint.searchParams.set("per_page", "1");
    const response = await fetch(endpoint, {
      ...(signal ? { signal } : {}),
      credentials: "omit",
      cache: "no-cache",
      headers: { accept: "application/json" },
    });
    if (response.ok) {
      const payload: unknown = await response.json();
      signal?.throwIfAborted();
      const post = Array.isArray(payload) ? payload[0] : undefined;
      if (post && typeof post === "object") {
        const record = post as {
          id?: unknown;
          title?: { rendered?: unknown };
          content?: { rendered?: unknown };
          excerpt?: { rendered?: unknown };
          modified?: unknown;
        };
        const rawContent =
          typeof record.content?.rendered === "string" &&
          record.content.rendered.trim()
            ? record.content.rendered
            : typeof record.excerpt?.rendered === "string"
              ? record.excerpt.rendered
              : "";
        const cleaned = cleanSuaraRawContent(rawContent, source.toString());
        const body = stripHtml(cleaned).slice(0, 200_000);
        if (body) {
          const article = OnlineArticleSchema.parse({
            id: String(record.id ?? slug),
            title:
              typeof record.title?.rendered === "string"
                ? stripHtml(record.title.rendered)
                : slug,
            body,
            url: source.toString(),
            source: "tjc.org",
            fetchedAt: new Date().toISOString(),
          });
          setCachedArticle(url, article);
          return article;
        }
      }
    }
  } catch (error) {
    signal?.throwIfAborted();
    recordDiagnostic("warn", "article.wp-json", error);
  }

  // 2. Fallback: fetch by search query
  try {
    const searchEndpoint = new URL("https://tjc.org/id/wp-json/wp/v2/posts");
    searchEndpoint.searchParams.set("search", slug);
    searchEndpoint.searchParams.set("per_page", "1");
    const response = await fetch(searchEndpoint, {
      ...(signal ? { signal } : {}),
      credentials: "omit",
      cache: "no-cache",
      headers: { accept: "application/json" },
    });
    if (response.ok) {
      const payload: unknown = await response.json();
      signal?.throwIfAborted();
      const post = Array.isArray(payload) ? payload[0] : undefined;
      if (post && typeof post === "object") {
        const record = post as {
          id?: unknown;
          title?: { rendered?: unknown };
          content?: { rendered?: unknown };
          excerpt?: { rendered?: unknown };
          modified?: unknown;
        };
        const rawContent =
          typeof record.content?.rendered === "string" &&
          record.content.rendered.trim()
            ? record.content.rendered
            : typeof record.excerpt?.rendered === "string"
              ? record.excerpt.rendered
              : "";
        const cleaned = cleanSuaraRawContent(rawContent, source.toString());
        const body = stripHtml(cleaned).slice(0, 200_000);
        if (body) {
          const article = OnlineArticleSchema.parse({
            id: String(record.id ?? slug),
            title:
              typeof record.title?.rendered === "string"
                ? stripHtml(record.title.rendered)
                : slug,
            body,
            url: source.toString(),
            source: "tjc.org",
            fetchedAt: new Date().toISOString(),
          });
          setCachedArticle(url, article);
          return article;
        }
      }
    }
  } catch (error) {
    signal?.throwIfAborted();
    recordDiagnostic("warn", "article.search", error);
  }

  signal?.throwIfAborted();
  if (cached) return cached;
  throw new Error("Artikel belum dapat dimuat di aplikasi");
}
