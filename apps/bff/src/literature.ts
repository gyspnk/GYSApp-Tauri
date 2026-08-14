import {
  LiteratureCatalogSchema,
  type LiteratureCategory,
  type LiteratureCatalog,
  type LiteratureItem,
} from "@gys/contracts";
import { htmlToText } from "./article.js";

const SOURCE = "https://tjc.org/id/literatur/";
const BOOK_SOURCE = "https://tjc.org/id/literatur/buku/";
const sections: Array<[LiteratureCategory, string]> = [
  ["kesaksian", "posts-table-1"],
  ["warta", "posts-table-2"],
  ["pelita-kecil", "posts-table-3"],
  ["panduan", "tb_9pdq304"],
];

function decode(value: string) {
  return htmlToText(value).replace(/\s+/g, " ").trim();
}

function absolute(value: string, base = SOURCE) {
  const cleaned = decode(value)
    .replace(/^http:\/\//i, "https://")
    .replace(/[\"\u0000]/g, "");
  if (cleaned.startsWith("../")) {
    return new URL(cleaned.slice(3), "https://tjc.org/id/").toString();
  }
  return new URL(cleaned, base).toString();
}

function sourceDate(value: string | undefined) {
  if (!value) return undefined;
  const normalized = value.trim().replace(/\//g, "-");
  const candidate =
    normalized.length === 10 ? `${normalized}T00:00:00.000Z` : normalized;
  const parsed = new Date(
    candidate.includes("T") ? candidate : `${candidate}Z`,
  );
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function formatFor(url: string, title: string): LiteratureItem["format"] {
  if (/\.pdf(?:$|[?#])/i.test(url)) return "pdf";
  if (/\b(?:edisi|buletin|warta|pelita)\b/i.test(title)) return "issue";
  return "article";
}

function itemFrom(
  category: LiteratureCategory,
  href: string,
  rawTitle: string,
  generatedAt: string,
  publishedAt?: string,
  base = SOURCE,
): LiteratureItem | undefined {
  const url = absolute(href, base);
  const title = decode(rawTitle);
  if (!title || !url.startsWith("https://tjc.org/")) return undefined;
  return {
    id: `${category}-${encodeURIComponent(url).replace(/%/g, "-").slice(0, 100)}`,
    category,
    title,
    description: "",
    url,
    format: formatFor(url, title),
    ...(publishedAt ? { publishedAt } : {}),
    updatedAt: publishedAt ?? generatedAt,
    source: "tjc.org",
  };
}

function rows(block: string) {
  return [...block.matchAll(/<tr\b[^>]*>(.*?)<\/tr>/gis)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));
}

function parseSection(
  html: string,
  category: LiteratureCategory,
  marker: string,
  generatedAt: string,
  base = SOURCE,
) {
  const start =
    marker.startsWith("posts-") || marker.startsWith("table_")
      ? html.indexOf(`id="${marker}"`)
      : html.indexOf(`module module-accordion ${marker}`);
  if (start < 0) return [];
  const end = html.indexOf("</table>", start);
  const block = html.slice(start, end > start ? end : html.length);
  const parsed: LiteratureItem[] = [];
  for (const row of rows(block)) {
    const link = row.match(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/is);
    if (!link) continue;
    const cells = [...row.matchAll(/<td\b[^>]*>(.*?)<\/td>/gis)].map((match) =>
      decode(match[1] ?? ""),
    );
    const href = link[1];
    const rawTitle = link[2];
    if (!href || !rawTitle) continue;
    const timestamp = cells.find((cell) =>
      /\d{4}[-/]\d{2}[-/]\d{2}/.test(cell),
    );
    const item = itemFrom(
      category,
      href,
      rawTitle,
      generatedAt,
      sourceDate(timestamp),
      base,
    );
    if (item) parsed.push(item);
  }
  if (parsed.length) return parsed;
  for (const match of block.matchAll(
    /<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gis,
  )) {
    const href = match[1];
    const rawTitle = match[2];
    if (!href || !rawTitle) continue;
    const item = itemFrom(
      category,
      href,
      rawTitle,
      generatedAt,
      undefined,
      base,
    );
    if (item) parsed.push(item);
  }
  return parsed;
}

async function readHtml(url: string) {
  const response = await fetch(url, { headers: { accept: "text/html" } });
  if (!response.ok)
    throw new Error(`literature source returned ${response.status}`);
  return response.text();
}

export async function fetchLiteratureCatalog(
  sourceUrl = SOURCE,
): Promise<LiteratureCatalog> {
  const generatedAt = new Date().toISOString();
  const html = await readHtml(sourceUrl);
  const items: LiteratureItem[] = [];
  for (const [category, marker] of sections) {
    items.push(...parseSection(html, category, marker, generatedAt));
  }
  try {
    const bookHtml = await readHtml(BOOK_SOURCE);
    items.push(
      ...parseSection(bookHtml, "buku", "table_1", generatedAt, BOOK_SOURCE),
    );
  } catch {
    // The primary catalogue remains available when the optional PDF index is down.
  }
  const unique = [...new Map(items.map((item) => [item.id, item])).values()];
  return LiteratureCatalogSchema.parse({
    source: "tjc.org",
    generatedAt,
    items: unique,
  });
}
