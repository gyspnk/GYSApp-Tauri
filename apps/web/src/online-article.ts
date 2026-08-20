import { OnlineArticleSchema, type OnlineArticle } from "@gys/contracts";
import { stripHtml } from "./sauh.js";
import { recordDiagnostic } from "./diagnostics.js";

function bffUrl(url: string): string {
  const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
  if (!base) throw new Error("BFF artikel belum dikonfigurasi");
  return `${base.replace(/\/$/, "")}/api/v1/content/article?url=${encodeURIComponent(url)}`;
}

const articleMemoryCache = new Map<string, OnlineArticle>();
const ARTICLE_STORAGE_PREFIX = "gys_article_cache_";

function getCachedArticle(url: string): OnlineArticle | undefined {
  const mem = articleMemoryCache.get(url);
  if (mem) return mem;
  if (typeof window === "undefined") return undefined;
  try {
    const raw =
      window.localStorage?.getItem(`${ARTICLE_STORAGE_PREFIX}${url}`) ||
      window.sessionStorage?.getItem(`${ARTICLE_STORAGE_PREFIX}${url}`);
    if (!raw) return undefined;
    const parsed = OnlineArticleSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      articleMemoryCache.set(url, parsed.data);
      return parsed.data;
    }
  } catch {
    // ignore parse error
  }
  return undefined;
}

function setCachedArticle(url: string, article: OnlineArticle) {
  articleMemoryCache.set(url, article);
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(
      `${ARTICLE_STORAGE_PREFIX}${url}`,
      JSON.stringify(article),
    );
  } catch {
    // ignore quota error
  }
  try {
    window.sessionStorage?.setItem(
      `${ARTICLE_STORAGE_PREFIX}${url}`,
      JSON.stringify(article),
    );
  } catch {
    // ignore quota error
  }
}

export async function fetchOnlineArticle(
  url: string,
  signal?: AbortSignal,
): Promise<OnlineArticle> {
  const cached = getCachedArticle(url);
  if (cached) return cached;

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
        const parsed = OnlineArticleSchema.safeParse(payload);
        if (parsed.success) {
          setCachedArticle(url, parsed.data);
          return parsed.data;
        }
      }
    } catch (error) {
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
        const body = stripHtml(rawContent).slice(0, 200_000);
        if (body) {
          const modified =
            typeof record.modified === "string" &&
            Number.isFinite(Date.parse(record.modified))
              ? new Date(record.modified).toISOString()
              : new Date().toISOString();
          const article = OnlineArticleSchema.parse({
            id: String(record.id ?? slug),
            title:
              typeof record.title?.rendered === "string"
                ? stripHtml(record.title.rendered)
                : slug,
            body,
            url: source.toString(),
            source: "tjc.org",
            fetchedAt: modified,
          });
          setCachedArticle(url, article);
          return article;
        }
      }
    }
  } catch (error) {
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
        const body = stripHtml(rawContent).slice(0, 200_000);
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
    recordDiagnostic("warn", "article.search", error);
  }

  throw new Error("Artikel belum dapat dimuat di aplikasi");
}
