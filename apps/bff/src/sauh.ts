import { SauhPostSchema, type SauhPost } from "@gys/contracts";

export function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/h[1-6]>|<\/li>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
    if (!title || !body || !url) continue;
    const updatedAt =
      typeof post.modified === "string" ? post.modified : post.date;
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
      imageUrl: post._embedded?.["wp:featuredmedia"]?.[0]?.source_url,
      updatedAt: new Date(
        typeof updatedAt === "string" ? updatedAt : Date.now(),
      ).toISOString(),
      source: "tjc.org",
    });
    if (parsed.success) result.push(parsed.data);
  }
  return result.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}
