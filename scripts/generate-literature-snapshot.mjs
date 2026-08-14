import { mkdir, writeFile } from "node:fs/promises";

const source = "https://tjc.org/id/literatur/";
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

function imageFromPost(post) {
  const media = post?._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
  const rendered = post?.content?.rendered;
  const match =
    typeof rendered === "string"
      ? rendered.match(
          /(?:data-src|data-lazy-src|src)=["'](https?:[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)/i,
        )
      : undefined;
  const value = typeof media === "string" ? media : match?.[1];
  if (!value || !/^https:\/\/tjc\.org\//i.test(value)) return undefined;
  return value;
}

async function coverFor(item) {
  const path = new URL(item.url).pathname.split("/").filter(Boolean);
  const slug = path.at(-1);
  if (!slug) return item;
  const endpoints = ["posts", "pages"].map(
    (type) =>
      `https://tjc.org/id/wp-json/wp/v2/${type}?slug=${encodeURIComponent(slug)}&_embed=wp:featuredmedia`,
  );
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: {
          accept: "application/json",
          "user-agent": "GYSApp-Tauri/1.0",
        },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) continue;
      const value = await response.json();
      const cover = Array.isArray(value) ? imageFromPost(value[0]) : undefined;
      if (cover) return { ...item, imageUrl: cover };
    } catch {
      // A missing post/cover is a valid catalog state; keep the source item.
    }
  }
  return item;
}

async function loadCategoryCovers() {
  const categories = [118, 116, 152];
  const map = new Map();
  for (const category of categories) {
    try {
      const response = await fetch(
        `https://tjc.org/id/wp-json/wp/v2/posts?categories=${category}&per_page=100&_embed=wp:featuredmedia`,
        {
          headers: {
            accept: "application/json",
            "user-agent": "GYSApp-Tauri/1.0",
          },
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (!response.ok) continue;
      const posts = await response.json();
      if (!Array.isArray(posts)) continue;
      for (const post of posts) {
        const cover = imageFromPost(post);
        const link = typeof post?.link === "string" ? post.link : undefined;
        const slug = typeof post?.slug === "string" ? post.slug : undefined;
        if (cover && link) map.set(new URL(link).toString(), cover);
        if (cover && slug) map.set(`slug:${slug}`, cover);
      }
    } catch {
      // Item-level discovery below remains the fallback for a source outage.
    }
  }
  return map;
}

async function enrichCovers(values) {
  const categoryCovers = await loadCategoryCovers();
  const enriched = [];
  const missing = [];
  for (const item of values) {
    const path = new URL(item.url).pathname.split("/").filter(Boolean);
    const slug = path.at(-1);
    const cover =
      categoryCovers.get(item.url) ??
      (slug ? categoryCovers.get(`slug:${slug}`) : undefined);
    if (cover) enriched.push({ ...item, imageUrl: cover });
    else missing.push(item);
  }
  for (let index = 0; index < missing.length; index += 8) {
    const batch = await Promise.all(
      missing.slice(index, index + 8).map(coverFor),
    );
    enriched.push(...batch);
  }
  const byId = new Map(enriched.map((item) => [item.id, item]));
  return values.map((item) => byId.get(item.id) ?? item);
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
      updatedAt: candidate.date ?? generatedAt,
      source: "tjc.org",
    });
  }
}
const catalog = {
  source: "tjc.org",
  generatedAt,
  items: await enrichCovers(items),
};
await mkdir("apps/web/public/offline", { recursive: true });
await writeFile(
  "apps/web/public/offline/literature.json",
  `${JSON.stringify(catalog, null, 2)}\n`,
);
console.log(`Generated ${items.length} literature links from ${source}`);
