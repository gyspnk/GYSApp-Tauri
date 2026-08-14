const source =
  "https://tjc.org/id/wp-json/wp/v2/posts?categories=194&per_page=6&orderby=date&order=desc&_embed=wp:featuredmedia";
const strip = (value) =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#8217;|&#39;|&apos;/gi, "'")
    .replace(/&#8230;|&hellip;/gi, "…")
    .replace(/\s+/g, " ")
    .trim();
const response = await fetch(source, {
  headers: { accept: "application/json" },
});
if (!response.ok)
  throw new Error(`Suara Sejati source returned ${response.status}`);
const posts = await response.json();
const items = Array.isArray(posts)
  ? posts.flatMap((post) => {
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
      const imageUrl = post?._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
      if (!title || !excerpt || !url || !publishedAt) return [];
      return [
        {
          id:
            typeof post?.slug === "string"
              ? post.slug
              : `suara-${post?.id ?? "item"}`,
          title,
          excerpt,
          url,
          ...(typeof imageUrl === "string" && imageUrl.startsWith("http")
            ? { imageUrl }
            : {}),
          publishedAt,
          source: "tjc.org",
        },
      ];
    })
  : [];
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
