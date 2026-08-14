import { SauhPostSchema, type SauhPost } from "@gys/contracts";

const STATIC_URL = `${import.meta.env.BASE_URL}offline/sauh.json`;
const WORDPRESS_URL =
  "https://tjc.org/id/wp-json/wp/v2/posts?categories=229&per_page=6&orderby=date&order=desc&_embed=wp:featuredmedia";

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, value: string) =>
      String.fromCodePoint(Math.min(0x10ffff, Number(value))),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, value: string) =>
      String.fromCodePoint(Math.min(0x10ffff, Number.parseInt(value, 16))),
    );
}

export function stripHtml(value: string): string {
  const unsafeRemoved = value.replace(
    /<(script|style|iframe|object|embed|template|svg)[^>]*>[\s\S]*?<\/\1>/gi,
    " ",
  );
  if (typeof DOMParser !== "undefined") {
    const document = new DOMParser().parseFromString(
      unsafeRemoved,
      "text/html",
    );
    document
      .querySelectorAll("script,style,iframe,object,embed,template,svg")
      .forEach((element) => element.remove());
    document
      .querySelectorAll("br")
      .forEach((element) => element.replaceWith("\n"));
    document
      .querySelectorAll("p,h1,h2,h3,h4,h5,h6,li")
      .forEach((element) => element.append("\n"));
    return decodeEntities(document.body.textContent ?? "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return decodeEntities(
    unsafeRemoved
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>|<\/h[1-6]>|<\/li>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstParagraph(value: string): string {
  const text = stripHtml(value);
  return text.split(/\n{2,}/)[0]?.trim() || text.slice(0, 440);
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
  const quote = text.match(/[“"]([^“”"]{18,320})[”"]/);
  return (
    quote?.[1]?.trim() ?? text.split(/\n/).find((line) => line.length > 30)
  );
}

/** Convert the WordPress post shape used by the upstream into our stable contract. */
export function parseSauhPosts(value: unknown): SauhPost[] {
  if (!Array.isArray(value)) {
    const envelope = value as { items?: unknown } | null;
    value = envelope?.items;
  }
  if (!Array.isArray(value)) return [];
  const parsed: SauhPost[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const post = item as {
      id?: unknown;
      slug?: unknown;
      date?: unknown;
      modified?: unknown;
      link?: unknown;
      title?: { rendered?: unknown } | string;
      content?: { rendered?: unknown };
      excerpt?: { rendered?: unknown };
      _embedded?: {
        [key: string]: Array<{ source_url?: unknown }> | undefined;
      };
      reference?: unknown;
      verse?: unknown;
      body?: unknown;
      url?: unknown;
    };
    const rawBody =
      typeof post.body === "string"
        ? post.body
        : typeof post.content?.rendered === "string"
          ? post.content.rendered
          : typeof post.excerpt?.rendered === "string"
            ? post.excerpt.rendered
            : "";
    const title =
      typeof post.title === "object" && typeof post.title?.rendered === "string"
        ? stripHtml(post.title.rendered)
        : typeof post.title === "string"
          ? post.title
          : "";
    const body = firstParagraph(rawBody) || "Renungan Sauh Bagi Jiwa.";
    const sourceUrl = typeof post.url === "string" ? post.url : post.link;
    if (!title || typeof sourceUrl !== "string") continue;
    const reference =
      typeof post.reference === "string"
        ? post.reference
        : referenceFrom(stripHtml(rawBody));
    const verse =
      typeof post.verse === "string" ? post.verse : quoteFrom(rawBody);
    const embeddedImage = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
    const updatedAt =
      typeof post.modified === "string"
        ? post.modified
        : typeof post.date === "string"
          ? post.date
          : new Date().toISOString();
    const candidate = {
      id:
        typeof post.slug === "string"
          ? post.slug
          : `sauh-${String(post.id ?? parsed.length + 1)}`,
      title,
      ...(reference ? { reference } : {}),
      ...(verse ? { verse } : {}),
      body,
      url: sourceUrl,
      ...(typeof embeddedImage === "string" ? { imageUrl: embeddedImage } : {}),
      updatedAt: new Date(updatedAt).toISOString(),
      source: "tjc.org" as const,
    };
    const result = SauhPostSchema.safeParse(candidate);
    if (result.success) parsed.push(result.data);
  }
  return parsed.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

function localDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

/** The home surface intentionally exposes only today's Sauh entry. */
export function onlyTodaySauh(posts: SauhPost[], now = new Date()): SauhPost[] {
  const today = localDateKey(now);
  return posts.filter(
    (post) => localDateKey(new Date(post.updatedAt)) === today,
  );
}

/**
 * WordPress can expose a post's modified timestamp in UTC after the local
 * calendar day has started. The daily slug is the publisher's canonical day
 * key, so use it as a narrow fallback without ever showing an arbitrary stale
 * reflection.
 */
export function selectTodaySauh(
  posts: SauhPost[],
  now = new Date(),
): SauhPost[] {
  const dated = onlyTodaySauh(posts, now);
  if (dated.length) return dated;
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const expected = `sbj${year}${month}${day}`;
  return posts.filter((post) => post.id === expected);
}

async function request(url: string, signal?: AbortSignal): Promise<SauhPost[]> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 4_000);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-cache",
    });
    if (!response.ok)
      throw new Error(`Sauh request failed: ${response.status}`);
    return parseSauhPosts(await response.json());
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export async function fetchSauh(signal?: AbortSignal): Promise<SauhPost[]> {
  const bff = import.meta.env.VITE_BFF_BASE_URL?.trim();
  const networkCandidates = [
    bff ? `${bff.replace(/\/$/, "")}/api/v1/content/sauh` : undefined,
    WORDPRESS_URL,
  ].filter((value): value is string => Boolean(value));
  // Offline users should see the pinned daily snapshot immediately instead
  // of waiting for two network timeouts before the fallback is attempted.
  const candidates =
    typeof navigator !== "undefined" && !navigator.onLine
      ? [STATIC_URL, ...networkCandidates]
      : [...networkCandidates, STATIC_URL];
  let lastError: unknown;
  for (const url of candidates) {
    try {
      const items = await request(url, signal);
      const today = selectTodaySauh(items);
      if (today.length) return today;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Sauh Bagi Jiwa is unavailable");
}
