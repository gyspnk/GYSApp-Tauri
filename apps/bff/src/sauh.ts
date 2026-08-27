import { SauhPostSchema, type SauhPost } from "@gys/contracts";
import { htmlToText } from "./article.js";

export function cleanSauhHtml(rawHtml: string): string {
  let cleaned = rawHtml.replace(
    /<(script|style|iframe|object|embed|template|svg|audio|form)[^>]*>[\s\S]*?<\/\1>/gi,
    " ",
  );

  const cutoffRegexes = [
    /<(?:div|h[1-6]|span|section)[^>]*class="[^"]*(?:module-fancy-heading|tb_zlsh85)[^"]*"[^>]*>[\s\S]*?Sauh Bagi Jiwa Sebelumnya/i,
    /Sauh Bagi Jiwa Sebelumnya/i,
    /<(?:div|section)[^>]*id=["'](?:GBA|Ayat)["']/i,
    /<ul[^>]*class="[^"]*module-accordion[^"]*"[^>]*>/i,
    /Apakah Anda sudah membaca Alkitab/i,
    /Terima kasih atas dukungan dari Saudara\/i/i,
    /Bank Central Asia/i,
  ];

  let earliestCutoff = cleaned.length;
  for (const regex of cutoffRegexes) {
    const match = cleaned.match(regex);
    if (match && match.index !== undefined && match.index < earliestCutoff) {
      earliestCutoff = match.index;
    }
  }
  cleaned = cleaned.slice(0, earliestCutoff);

  cleaned = cleaned.replace(
    /<div[^>]*class="[^"]*module-audio[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    " ",
  );
  cleaned = cleaned.replace(/\[audio[^\]]*\]/gi, " ");
  cleaned = cleaned.replace(
    /https?:\/\/[^\s<"']+\.(?:mp3|wav|ogg|m4a)[^\s<"']*/gi,
    " ",
  );
  cleaned = cleaned.replace(
    /<a[^>]*class="[^"]*su-button[^"]*"[^>]*>[\s\S]*?<\/a>/gi,
    " ",
  );
  cleaned = cleaned.replace(
    /<div[^>]*class="[^"]*shortcode[^"]*box[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    " ",
  );
  cleaned = cleaned.replace(
    /<p[^>]*>\s*<strong>\s*Renungan Tanggal:[\s\S]*?<\/p>/gi,
    " ",
  );
  cleaned = cleaned.replace(
    /<h[1-6][^>]*>[\s\S]*?Bacaan Alkitab Harian[\s\S]*?<\/h[1-6]>/gi,
    " ",
  );
  cleaned = cleaned.replace(
    /<h[1-6][^>]*>[\s\S]*?SAUH BAGI JIWA[\s\S]*?<\/h[1-6]>/gi,
    " ",
  );
  cleaned = cleaned.replace(
    /<a[^>]*class="[^"]*builder_button[^"]*"[^>]*>[\s\S]*?Gerakan Baca Alkitab[\s\S]*?<\/a>/gi,
    " ",
  );
  cleaned = cleaned.replace(
    /<span[^>]*class="[^"]*su-dropcap[^"]*"[^>]*>([A-Za-z0-9])<\/span>/gi,
    "$1",
  );

  return cleaned;
}

export function extractSauhBody(value: string): string {
  const cleaned = cleanSauhHtml(value);
  return htmlToText(
    cleaned
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(
        /<\/p>|<\/h[1-6]>|<\/li>|<\/div>|<\/section>|<\/article>/gi,
        "\n",
      )
      .replace(/<\/?(?:span|strong|b|em|i|u|a|small|font)[^>]*>/gi, ""),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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
  const { year, month, day } = publisherDateParts(date);
  return `sbj${year?.slice(-2)}${month}${day}`;
}

function publisherDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function localDateKey(value: Date) {
  const { year, month, day } = publisherDateParts(value);
  return `${year}-${month}-${day}`;
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

/** Sauh is a daily reflection; never expose a stale multi-day feed to clients. */
export function onlyTodaySauh(posts: SauhPost[], now = new Date()): SauhPost[] {
  const today = localDateKey(now);
  const canonical = posts.filter((post) => post.id === expectedSauhSlug(now));
  if (canonical.length) return canonical;
  const dated = posts.filter(
    (post) => localDateKey(new Date(post.updatedAt)) === today,
  );
  if (dated.length) return dated;
  return [];
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
    // Keep the full readable article for the Sauh viewer. The home card uses
    // its own first-paragraph excerpt, so truncating here silently broke the
    // detail route while pretending the upstream response was complete.
    const body = extractSauhBody(raw).slice(0, 20_000);
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
      ...(isTjcImageUrl(post._embedded?.["wp:featuredmedia"]?.[0]?.source_url)
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
