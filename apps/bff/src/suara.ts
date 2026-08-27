import { SuaraSejatiPostSchema, type SuaraSejatiPost } from "@gys/contracts";
import { htmlToText } from "./article.js";

const SOURCE =
  "https://tjc.org/id/wp-json/wp/v2/posts?categories=194&per_page=100&orderby=date&order=desc&_embed=wp:featuredmedia";
const PAGE_SIZE = 100;
const MAX_PAGES = 100;

function stripHtml(value: string) {
  return htmlToText(value).replace(/\s+/g, " ").trim();
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

export async function fetchSuaraSejati(
  sourceUrl = SOURCE,
): Promise<SuaraSejatiPost[]> {
  const source = new URL(sourceUrl);
  source.searchParams.set("per_page", String(PAGE_SIZE));
  const sourcePosts: unknown[] = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    source.searchParams.set("page", String(page));
    const response = await fetch(source.toString(), {
      headers: { accept: "application/json" },
    });
    if (!response.ok)
      throw new Error(`Suara Sejati source returned ${response.status}`);
    const value: unknown = await response.json();
    if (!Array.isArray(value)) {
      if (page === 1) return [];
      throw new Error("Suara Sejati source returned an invalid page");
    }
    sourcePosts.push(...value);
    const headerPages = Number(response.headers.get("x-wp-totalpages"));
    if (Number.isInteger(headerPages) && headerPages > 0) {
      if (headerPages > MAX_PAGES)
        throw new Error("Suara Sejati source returned too many pages");
      totalPages = headerPages;
    } else {
      totalPages = value.length < PAGE_SIZE ? page : page + 1;
    }
    if (value.length === 0) break;
    page += 1;
  }

  const posts: SuaraSejatiPost[] = [];
  const seen = new Set<string>();
  for (const item of sourcePosts) {
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
    const imageUrl = isTjcImageUrl(candidateImageUrl)
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
    if (parsed.success && !seen.has(parsed.data.id)) {
      seen.add(parsed.data.id);
      posts.push(parsed.data);
    }
  }
  return posts.sort((left, right) =>
    right.publishedAt.localeCompare(left.publishedAt),
  );
}
