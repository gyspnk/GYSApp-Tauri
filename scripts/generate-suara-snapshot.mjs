const source =
  "https://tjc.org/id/wp-json/wp/v2/posts?categories=194&per_page=100&orderby=date&order=desc&_embed=wp:featuredmedia";
const pageSize = 100;
const maxPages = 100;
const imageHosts = new Set([
  "tjc.org",
  "www.tjc.org",
  "tjcorguploads.s3.amazonaws.com",
]);
const strip = (value) =>
  value
    .replace(
      /<(script|style|iframe|object|embed|template|svg)[^>]*>[\s\S]*?<\/\1>/gi,
      " ",
    )
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#8217;|&#39;|&apos;/gi, "'")
    .replace(/&#8230;|&hellip;/gi, "…")
    .replace(/\s+/g, " ")
    .trim();
const sourceUrl = new URL(source);
const posts = [];
const imageHealth = new Map();

function isImageUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" && imageHosts.has(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

async function healthyImageUrl(media) {
  if (!media || typeof media !== "object") return undefined;
  const sizes = media.media_details?.sizes ?? {};
  const candidates = [
    sizes.medium?.source_url,
    sizes.thumbnail?.source_url,
    sizes.medium_large?.source_url,
    media.source_url,
  ].filter(isImageUrl);
  for (const candidate of candidates) {
    if (!imageHealth.has(candidate)) {
      let healthy = false;
      try {
        const response = await fetch(candidate, {
          method: "HEAD",
          headers: {
            accept: "image/avif,image/webp,image/*,*/*;q=0.8",
            "user-agent": "Mozilla/5.0",
          },
          signal: AbortSignal.timeout(5_000),
        });
        healthy = response.ok;
      } catch {
        healthy = false;
      }
      imageHealth.set(candidate, healthy);
    }
    if (imageHealth.get(candidate)) return candidate;
  }
  return undefined;
}

let page = 1;
let totalPages = 1;
while (page <= totalPages) {
  sourceUrl.searchParams.set("page", String(page));
  sourceUrl.searchParams.set("per_page", String(pageSize));
  const response = await fetch(sourceUrl, {
    headers: { accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(`Suara Sejati source returned ${response.status}`);
  const pagePosts = await response.json();
  if (!Array.isArray(pagePosts))
    throw new Error("Suara Sejati source returned an invalid page");
  posts.push(...pagePosts);
  const headerPages = Number(response.headers.get("x-wp-totalpages"));
  if (Number.isInteger(headerPages) && headerPages > 0) {
    if (headerPages > maxPages)
      throw new Error("Suara Sejati source returned too many pages");
    totalPages = headerPages;
  } else {
    totalPages = pagePosts.length < pageSize ? page : page + 1;
  }
  if (pagePosts.length === 0) break;
  page += 1;
}
const items = (
  await Promise.all(
    posts.map(async (post) => {
      const title =
        typeof post?.title?.rendered === "string"
          ? strip(post.title.rendered)
          : "";
      const excerpt =
        typeof post?.excerpt?.rendered === "string"
          ? strip(post.excerpt.rendered)
          : "";
      const publishedAt =
        typeof post?.date === "string"
          ? new Date(post.date).toISOString()
          : undefined;
      const url = typeof post?.link === "string" ? post.link : "";
      if (!title || !excerpt || !url || !publishedAt) return undefined;
      const imageUrl = await healthyImageUrl(
        post?._embedded?.["wp:featuredmedia"]?.[0],
      );
      return {
        id:
          typeof post?.slug === "string"
            ? post.slug
            : `suara-${post?.id ?? "item"}`,
        title,
        excerpt,
        url,
        ...(imageUrl ? { imageUrl } : {}),
        publishedAt,
        source: "tjc.org",
      };
    }),
  )
).filter(Boolean);
const catalog = {
  source: "tjc.org",
  generatedAt: new Date().toISOString(),
  items,
};
await import("node:fs/promises").then(({ mkdir, writeFile }) =>
  mkdir("apps/web/public/offline", { recursive: true }).then(() =>
    writeFile(
      "apps/web/public/offline/suara-sejati.json",
      `${JSON.stringify(catalog, null, 2)}\n`,
    ),
  ),
);
console.log(`Generated ${items.length} Suara Sejati posts.`);
