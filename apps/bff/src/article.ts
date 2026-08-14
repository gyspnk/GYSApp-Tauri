import { OnlineArticleSchema, type OnlineArticle } from "@gys/contracts";

const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "td",
  "th",
  "tr",
  "ul",
]);
const SKIP_TAGS = new Set([
  "canvas",
  "embed",
  "iframe",
  "object",
  "script",
  "style",
  "svg",
  "template",
]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  hellip: "…",
  nbsp: " ",
  quot: '"',
  raquo: "»",
  laquo: "«",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  middot: "·",
};

function decodeEntity(value: string): string {
  const codePoint = (value: number): string | undefined =>
    Number.isInteger(value) && value >= 0 && value <= 0x10ffff
      ? String.fromCodePoint(value)
      : undefined;
  return value.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z][a-z0-9]+));/gi,
    (whole, decimal: string, hexadecimal: string, named: string) => {
      if (decimal) {
        return codePoint(Number(decimal)) ?? whole;
      }
      if (hexadecimal) {
        return codePoint(Number.parseInt(hexadecimal, 16)) ?? whole;
      }
      return NAMED_ENTITIES[named.toLowerCase()] ?? whole;
    },
  );
}

function tagEnd(value: string, start: number): number {
  let quote = "";
  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return value.length - 1;
}

function tagInfo(value: string): {
  name: string;
  closing: boolean;
  selfClosing: boolean;
} {
  const inner = value
    .slice(1, -1)
    .trim()
    .replace(/^!DOCTYPE\b[^]*$/i, "")
    .trim();
  const closing = inner.startsWith("/");
  const withoutSlash = inner.replace(/^\//, "");
  const name = withoutSlash.split(/\s|\//, 1)[0]?.toLowerCase() ?? "";
  return { name, closing, selfClosing: /\/\s*$/.test(inner) };
}

function extractContainer(html: string): string {
  const lower = html.toLowerCase();
  for (const candidate of ["article", "main"]) {
    const opening = lower.indexOf(`<${candidate}`);
    if (opening < 0) continue;
    const openingEnd = tagEnd(html, opening);
    const close = lower.indexOf(`</${candidate}>`, openingEnd + 1);
    if (close > openingEnd) return html.slice(openingEnd + 1, close);
  }
  const marker = lower.indexOf("entry-content");
  if (marker >= 0) {
    const opening = lower.lastIndexOf("<div", marker);
    if (opening >= 0) {
      const openingEnd = tagEnd(html, opening);
      const close = lower.indexOf("</div>", openingEnd + 1);
      if (close > openingEnd) return html.slice(openingEnd + 1, close);
    }
  }
  return html;
}

/** Convert upstream HTML to plain text without exposing markup or scripts. */
export function htmlToText(value: string): string {
  let output = "";
  let skip: string | undefined;
  let index = 0;
  while (index < value.length) {
    if (value.startsWith("<!--", index)) {
      const end = value.indexOf("-->", index + 4);
      index = end < 0 ? value.length : end + 3;
      continue;
    }
    if (value[index] === "<") {
      const end = tagEnd(value, index);
      const info = tagInfo(value.slice(index, end + 1));
      if (skip) {
        if (info.closing && info.name === skip) skip = undefined;
        index = end + 1;
        continue;
      }
      if (!info.closing && SKIP_TAGS.has(info.name) && !info.selfClosing) {
        skip = info.name;
        const closing = value.toLowerCase().indexOf(`</${info.name}`, end + 1);
        index = closing >= 0 ? closing : value.length;
        continue;
      } else if (BLOCK_TAGS.has(info.name)) {
        output += "\n";
      }
      index = end + 1;
      continue;
    }
    const nextTag = value.indexOf("<", index);
    const nextEntity = value.indexOf("&", index);
    const end = Math.min(
      nextTag >= 0 ? nextTag : value.length,
      nextEntity >= 0 ? nextEntity : value.length,
    );
    if (end === index && value[index] === "&") {
      const semicolon = value.indexOf(";", index + 1);
      if (semicolon > index && semicolon - index <= 32) {
        output += decodeEntity(value.slice(index, semicolon + 1));
        index = semicolon + 1;
        continue;
      }
    }
    output += value.slice(index, end);
    index = end;
  }
  return output
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t\f]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function titleFrom(html: string, fallback: string): string {
  const lower = html.toLowerCase();
  for (const tag of ["h1", "title"]) {
    const opening = lower.indexOf(`<${tag}`);
    if (opening < 0) continue;
    const openingEnd = tagEnd(html, opening);
    const close = lower.indexOf(`</${tag}>`, openingEnd + 1);
    if (close > openingEnd) {
      const title = htmlToText(html.slice(openingEnd + 1, close));
      if (title) return title;
    }
  }
  return fallback;
}

function isAllowedArticleUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      ["tjc.org", "www.tjc.org"].includes(parsed.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

export function normalizeArticle(
  html: string,
  url: string,
  fetchedAt = new Date().toISOString(),
): OnlineArticle {
  const parsedUrl = new URL(url);
  const container = extractContainer(html);
  const body = htmlToText(container).slice(0, 200_000);
  if (!body) throw new Error("article body is empty");
  return OnlineArticleSchema.parse({
    id: parsedUrl.pathname.replace(/^\/+|\/+$/g, "") || parsedUrl.hostname,
    title: titleFrom(
      container,
      parsedUrl.pathname.split("/").filter(Boolean).pop() ?? "Artikel",
    ),
    body,
    url: parsedUrl.toString(),
    source: "tjc.org",
    fetchedAt,
  });
}

export async function fetchArticle(
  url: string,
  signal?: AbortSignal,
): Promise<OnlineArticle> {
  const response = await fetch(url, {
    headers: { accept: "text/html,application/xhtml+xml" },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok)
    throw new Error(`article source returned ${response.status}`);
  if (response.url && !isAllowedArticleUrl(response.url))
    throw new Error("article source redirected outside the allowlist");
  return normalizeArticle(await response.text(), url);
}
