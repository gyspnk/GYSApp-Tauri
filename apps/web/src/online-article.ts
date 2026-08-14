import { OnlineArticleSchema, type OnlineArticle } from "@gys/contracts";
import { stripHtml } from "./sauh.js";

function bffUrl(url: string): string {
  const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
  if (!base) throw new Error("BFF artikel belum dikonfigurasi");
  return `${base.replace(/\/$/, "")}/api/v1/content/article?url=${encodeURIComponent(url)}`;
}

export async function fetchOnlineArticle(
  url: string,
  signal?: AbortSignal,
): Promise<OnlineArticle> {
  const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
  if (base) {
    const response = await fetch(bffUrl(url), {
      ...(signal ? { signal } : {}),
      credentials: "omit",
      cache: "no-cache",
    });
    if (!response.ok)
      throw new Error(`Article request failed: ${response.status}`);
    return OnlineArticleSchema.parse(await response.json());
  }

  // GitHub Pages previews do not have a Worker binding. Use the public
  // WordPress post endpoint as a constrained compatibility fallback so the
  // primary reading flow still stays inside the app. The same plain-text
  // sanitizer and 200k body bound apply before the contract is returned.
  const source = new URL(url);
  if (
    source.protocol !== "https:" ||
    !["tjc.org", "www.tjc.org"].includes(source.hostname.toLowerCase())
  )
    throw new Error("Article source is not allowlisted");
  const slug = source.pathname.split("/").filter(Boolean).pop();
  if (!slug) throw new Error("Article slug is missing");
  const endpoint = new URL("https://tjc.org/id/wp-json/wp/v2/posts");
  endpoint.searchParams.set("slug", slug);
  endpoint.searchParams.set("per_page", "1");
  const response = await fetch(endpoint, {
    ...(signal ? { signal } : {}),
    credentials: "omit",
    cache: "no-cache",
    headers: { accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(`Article fallback request failed: ${response.status}`);
  const payload: unknown = await response.json();
  const post = Array.isArray(payload) ? payload[0] : undefined;
  if (!post || typeof post !== "object")
    throw new Error("Article is not available in the public feed");
  const record = post as {
    id?: unknown;
    title?: { rendered?: unknown };
    content?: { rendered?: unknown };
    modified?: unknown;
  };
  const body =
    typeof record.content?.rendered === "string"
      ? stripHtml(record.content.rendered).slice(0, 200_000)
      : "";
  if (!body) throw new Error("Article body is empty");
  const modified =
    typeof record.modified === "string" &&
    Number.isFinite(Date.parse(record.modified))
      ? new Date(record.modified).toISOString()
      : new Date().toISOString();
  return OnlineArticleSchema.parse({
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
}
