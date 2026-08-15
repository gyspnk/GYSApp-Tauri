import { SauhPostSchema, type SauhPost } from "@gys/contracts";
import { htmlToText } from "./article.js";

export function stripHtml(value: string): string {
  return htmlToText(value);
}

function referenceFrom(value: string): string | undefined {
  const parenthetical = value.match(/\(([^()]{2,80}\d+[^()]*)\)/);
  if (parenthetical?.[1]) return parenthetical[1].trim();
  return value.match(
    /\b(?:[1-3]\s*)?[A-ZÀ-Ý][\p{L}-]*(?:\s+[A-ZÀ-Ý][\p{L}-]*)*\s+\d+:\d+(?:-\d+)?\b/u,
  )?.[0];
}

function quoteFrom(value: string): string | undefined {
  const text = stripHtml(value);
  const match = text.match(/[“"]([^“”"]{18,320})[”"]/);
  return (
    match?.[1]?.trim() ?? text.split(/\n/).find((line) => line.length > 30)
  );
}

export function expectedSauhSlug(date = new Date()): string {
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `sbj${year}${month}${day}`;
}

function localDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
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

/** Sauh is a daily reflection; never expose a stale multi-day feed to clients. */
export function onlyTodaySauh(posts: SauhPost[], now = new Date()): SauhPost[] {
  const today = localDateKey(now);
  const dated = posts.filter(
    (post) => localDateKey(new Date(post.updatedAt)) === today,
  );
  if (dated.length) return dated;
  const expected = `sbj${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return posts.filter((post) => post.id === expected);
}

export function normalizeSauhPosts(value: unknown): SauhPost[] {
  if (!Array.isArray(value)) return [];
  const result: SauhPost[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const post = item as {
      id?: unknown;
      slug?: unknown;
      date?: unknown;
      modified?: unknown;
      link?: unknown;
      title?: { rendered?: unknown };
      content?: { rendered?: unknown };
      excerpt?: { rendered?: unknown };
      _embedded?: {
        [key: string]: Array<{ source_url?: unknown }> | undefined;
      };
    };
    const title =
      typeof post.title?.rendered === "string"
        ? stripHtml(post.title.rendered)
        : "";
    const raw =
      typeof post.content?.rendered === "string"
        ? post.content.rendered
        : typeof post.excerpt?.rendered === "string"
          ? post.excerpt.rendered
          : "";
    const body = stripHtml(raw).slice(0, 1_200);
    const url = typeof post.link === "string" ? post.link : "";
    const updatedAt =
      typeof post.modified === "string" ? post.modified : post.date;
    const parsedUpdatedAt =
      typeof updatedAt === "string" ? new Date(updatedAt) : undefined;
    if (
      !title ||
      !body ||
      !isTjcUrl(url) ||
      !parsedUpdatedAt ||
      Number.isNaN(parsedUpdatedAt.getTime())
    )
      continue;
    const parsed = SauhPostSchema.safeParse({
      id:
        typeof post.slug === "string"
          ? post.slug
          : `sauh-${String(post.id ?? result.length)}`,
      title,
      reference: referenceFrom(body),
      verse: quoteFrom(raw),
      body,
      url,
      ...(isTjcUrl(post._embedded?.["wp:featuredmedia"]?.[0]?.source_url)
        ? { imageUrl: post._embedded?.["wp:featuredmedia"]?.[0]?.source_url }
        : {}),
      updatedAt: parsedUpdatedAt.toISOString(),
      source: "tjc.org",
    });
    if (parsed.success) result.push(parsed.data);
  }
  return result.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}
