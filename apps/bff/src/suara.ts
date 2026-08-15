import { SuaraSejatiPostSchema, type SuaraSejatiPost } from "@gys/contracts";
import { htmlToText } from "./article.js";

const SOURCE =
  "https://tjc.org/id/wp-json/wp/v2/posts?categories=194&per_page=6&orderby=date&order=desc&_embed=wp:featuredmedia";

function stripHtml(value: string) {
  return htmlToText(value).replace(/\s+/g, " ").trim();
}

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

export async function fetchSuaraSejati(
  sourceUrl = SOURCE,
): Promise<SuaraSejatiPost[]> {
  const response = await fetch(sourceUrl, {
    headers: { accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(`Suara Sejati source returned ${response.status}`);
  const value: unknown = await response.json();
  if (!Array.isArray(value)) return [];
  const posts: SuaraSejatiPost[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const post = item as {
      id?: unknown;
      date?: unknown;
      link?: unknown;
      slug?: unknown;
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
    const url = typeof post.link === "string" ? post.link : "";
    const parsedDate =
      typeof post.date === "string" ? new Date(post.date) : undefined;
    const publishedAt =
      parsedDate && !Number.isNaN(parsedDate.getTime())
        ? parsedDate.toISOString()
        : undefined;
    if (!title || !excerpt || !isTjcUrl(url) || !publishedAt) continue;
    const candidateImageUrl =
      post._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
    const imageUrl = isTjcUrl(candidateImageUrl)
      ? candidateImageUrl
      : undefined;
    const parsed = SuaraSejatiPostSchema.safeParse({
      id:
        typeof post.slug === "string"
          ? post.slug
          : `suara-${String(post.id ?? posts.length)}`,
      title,
      excerpt,
      url,
      ...(imageUrl ? { imageUrl } : {}),
      publishedAt,
      source: "tjc.org",
    });
    if (parsed.success) posts.push(parsed.data);
  }
  return posts.sort((left, right) =>
    right.publishedAt.localeCompare(left.publishedAt),
  );
}
