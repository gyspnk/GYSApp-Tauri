import { mkdir, writeFile } from "node:fs/promises";

const source = "https://tjc.org/id/literatur/";
const wordpress = "https://tjc.org/id/wp-json/wp/v2";
const undatedResourceVersion = "1970-01-01T00:00:00.000Z";
const imageCategoryIds = new Map([
  ["kesaksian", 118],
  ["warta", 116],
  ["pelita-kecil", 152],
]);
const imageHosts = new Set([
  "tjc.org",
  "www.tjc.org",
  "tjcorguploads.s3.amazonaws.com",
]);
const pages = [
  ["kesaksian", source, "posts-table-1"],
  ["warta", source, "posts-table-2"],
  ["pelita-kecil", source, "posts-table-3"],
  ["panduan", source, "tb_9pdq304"],
  ["buku", "https://tjc.org/id/literatur/buku/", "table_1"],
];
const decode = (value) =>
  value
    .replace(
      /<(script|style|iframe|object|embed|template|svg)[^>]*>[\s\S]*?<\/\1>/gi,
      " ",
    )
    .replace(/&#8211;|&#x2013;/gi, "–")
    .replace(/&#8217;|&#x27;|&#039;/gi, "'")
    .replace(/&#8220;|&#x201c;/gi, "“")
    .replace(/&#8221;|&#x201d;/gi, "”")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#x2f;|&#47;/gi, "/")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
const absolute = (value, base) =>
  (() => {
    const cleaned = decode(value)
      .replace(/^http:\/\//i, "https://")
      .replace(/[\"\u0000]/g, "");
    return cleaned.startsWith("../")
      ? new URL(cleaned.slice(3), "https://tjc.org/id/").toString()
      : new URL(cleaned, base).toString();
  })();
const sourceDate = (value) => {
  if (!value) return undefined;
  const normalized = value.trim().replace(/\//g, "-");
  const candidate =
    normalized.length === 10 ? `${normalized}T00:00:00.000Z` : normalized;
  const parsed = new Date(
    candidate.includes("T") ? candidate : `${candidate}Z`,
  );
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};
const formatFor = (url, title) =>
  /\.pdf(?:$|[?#])/i.test(url)
    ? "pdf"
    : /\b(?:edisi|buletin|warta|pelita)\b/i.test(title)
      ? "issue"
      : "article";

const isImageUrl = (value) => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      imageHosts.has(url.hostname.toLowerCase()) &&
      /\.(?:avif|gif|jpe?g|png|webp)(?:$|[?#])/i.test(url.pathname)
    );
  } catch {
    return false;
  }
};

const imageHealth = new Map();
async function healthyImageUrl(media) {
  if (!media || typeof media !== "object") return undefined;
  const sizes = media.media_details?.sizes ?? {};
  const candidates = [
    sizes.medium?.source_url,
    sizes.thumbnail?.source_url,
    sizes.medium_large?.source_url,
    media.source_url,
  ].filter(isImageUrl);
  const checks = await Promise.all(
    candidates.map((candidate) => {
      let check = imageHealth.get(candidate);
      if (!check) {
        check = fetch(candidate, {
          method: "HEAD",
          headers: { accept: "image/*", "user-agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(5_000),
        })
          .then(
            (response) =>
              response.ok &&
              (response.headers.get("content-type") ?? "").startsWith("image/"),
          )
          .catch(() => false);
        imageHealth.set(candidate, check);
      }
      return check;
    }),
  );
  return candidates.find((_, index) => checks[index]);
}

async function mapConcurrent(values, limit, worker) {
  const result = new Array(values.length);
  let next = 0;
  async function consume() {
    while (next < values.length) {
      const index = next++;
      result[index] = await worker(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, consume),
  );
  return result;
}

async function readJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(`WordPress request returned ${response.status}`);
  return response.json();
}

async function readPostMetadata(categoryId) {
  const posts = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const url = new URL(`${wordpress}/posts`);
    url.searchParams.set("categories", String(categoryId));
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    url.searchParams.set("orderby", "date");
    url.searchParams.set("order", "desc");
    url.searchParams.set("_fields", "id,link,featured_media");
    const response = await fetch(url, {
      headers: { accept: "application/json" },
    });
    if (!response.ok)
      throw new Error(`WordPress request returned ${response.status}`);
    const value = await response.json();
    if (!Array.isArray(value)) break;
    posts.push(...value);
    const headerPages = Number(response.headers.get("x-wp-totalpages"));
    totalPages =
      Number.isInteger(headerPages) && headerPages > 0
        ? headerPages
        : value.length < 100
          ? page
          : page + 1;
    page += 1;
  }
  return posts;
}

async function readMediaMetadata(ids) {
  const media = [];
  for (let index = 0; index < ids.length; index += 100) {
    const url = new URL(`${wordpress}/media`);
    url.searchParams.set("include", ids.slice(index, index + 100).join(","));
    url.searchParams.set("per_page", "100");
    url.searchParams.set("_fields", "id,source_url,media_details");
    const value = await readJson(url);
    if (Array.isArray(value)) media.push(...value);
  }
  return media;
}

async function loadCoverByUrl() {
  const postLists = await Promise.all(
    [...imageCategoryIds.values()].map((categoryId) =>
      readPostMetadata(categoryId),
    ),
  );
  const posts = postLists.flat();
  const mediaById = new Map(
    (
      await readMediaMetadata([
        ...new Set(posts.map((post) => post.featured_media).filter(Boolean)),
      ])
    ).map((media) => [media.id, media]),
  );
  const entries = await mapConcurrent(posts, 12, async (post) => {
    const imageUrl = await healthyImageUrl(mediaById.get(post.featured_media));
    return imageUrl && typeof post.link === "string"
      ? [new URL(post.link).pathname, imageUrl]
      : undefined;
  });
  return new Map(entries.filter((entry) => entry));
}

const generatedAt = new Date().toISOString();
const items = [];
for (const [category, url, marker] of pages) {
  const response = await fetch(url, { headers: { accept: "text/html" } });
  if (!response.ok)
    throw new Error(`literature source returned ${response.status}`);
  const html = await response.text();
  const start =
    marker.startsWith("posts-") || marker.startsWith("table_")
      ? html.indexOf(`id="${marker}"`)
      : html.indexOf(`module module-accordion ${marker}`);
  if (start < 0) continue;
  const tableEnd = html.indexOf("</table>", start);
  const block = html.slice(start, tableEnd > start ? tableEnd : html.length);
  const rows = [...block.matchAll(/<tr\b[^>]*>(.*?)<\/tr>/gis)].map(
    (match) => match[1],
  );
  const candidates = rows.length
    ? rows.map((row) => {
        const link = row.match(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/is);
        const cells = [...row.matchAll(/<td\b[^>]*>(.*?)<\/td>/gis)].map(
          (match) => decode(match[1]),
        );
        return link
          ? {
              link,
              date: sourceDate(
                cells.find((cell) => /\d{4}[-/]\d{2}[-/]\d{2}/.test(cell)),
              ),
            }
          : null;
      })
    : [...block.matchAll(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gis)].map(
        (match) => ({ link: match, date: undefined }),
      );
  for (const candidate of candidates) {
    if (!candidate) continue;
    const href = absolute(candidate.link[1], url);
    const title = decode(candidate.link[2]);
    if (!title || !href.startsWith("https://tjc.org/")) continue;
    const id = `${category}-${encodeURIComponent(href).replace(/%/g, "-").slice(0, 100)}`;
    if (items.some((item) => item.id === id)) continue;
    items.push({
      id,
      category,
      title,
      description: "",
      url: href,
      format: formatFor(href, title),
      ...(candidate.date ? { publishedAt: candidate.date } : {}),
      updatedAt: candidate.date ?? undatedResourceVersion,
      source: "tjc.org",
    });
  }
}

let covers = new Map();
try {
  covers = await loadCoverByUrl();
} catch (error) {
  console.warn(`Literature cover metadata unavailable: ${error}`);
}
for (const item of items) {
  const imageUrl = covers.get(new URL(item.url).pathname);
  if (imageUrl) item.imageUrl = imageUrl;
}
const catalog = {
  source: "tjc.org",
  generatedAt,
  items,
};
await mkdir("apps/web/public/offline", { recursive: true });
await writeFile(
  "apps/web/public/offline/literature.json",
  `${JSON.stringify(catalog, null, 2)}\n`,
);
console.log(`Generated ${items.length} literature links from ${source}`);
