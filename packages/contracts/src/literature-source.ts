/** The public publisher boundary shared by browser and PDF proxy. */
export function isOfficialPdfUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      /\.pdf$/i.test(url.pathname) &&
      (["tjc.org", "www.tjc.org"].includes(url.hostname) ||
        (url.hostname === "tjcorguploads.s3.amazonaws.com" &&
          url.pathname.startsWith("/tjcorg/wp-content/uploads/")))
    );
  } catch {
    return false;
  }
}

export function literatureIssuePostUrl(value: string): string | undefined {
  try {
    const source = new URL(value);
    if (
      source.protocol !== "https:" ||
      source.username ||
      source.password ||
      !["tjc.org", "www.tjc.org"].includes(source.hostname) ||
      (source.port && source.port !== "443") ||
      !/^\/id\/(?:warta-sejati|pelitakecil)\/[^/]+\/?$/.test(source.pathname)
    )
      return;
    const slug = decodeURIComponent(
      source.pathname.split("/").filter(Boolean).at(-1)!,
    );
    const endpoint = new URL("https://tjc.org/id/wp-json/wp/v2/posts");
    endpoint.searchParams.set("slug", slug);
    endpoint.searchParams.set("per_page", "1");
    endpoint.searchParams.set("_fields", "content");
    return endpoint.href;
  } catch {
    return;
  }
}

/** Read links/embeds as data; publisher markup is never inserted into the UI. */
export function extractOfficialPdfUrl(
  payload: unknown,
  source: string,
): string | undefined {
  const post = Array.isArray(payload) ? payload[0] : undefined;
  const rendered =
    post && typeof post === "object"
      ? (post as { content?: { rendered?: unknown } }).content?.rendered
      : undefined;
  if (typeof rendered !== "string") return;
  const content = rendered
    .slice(0, 2_000_000)
    .replace(/&(?:amp|#38|#x26);/gi, "&");
  const links = content.matchAll(
    /(?:href|src|data-src|data-url)\s*=\s*["']([^"']+)["']/gi,
  );
  for (const match of links) {
    try {
      const url = new URL(match[1]!, source).href;
      if (isOfficialPdfUrl(url)) return url;
    } catch {
      /* Try the next publisher link. */
    }
  }
  for (const match of content.matchAll(
    /https:\/\/[^"'<>\s\\]+\.pdf(?:[?#][^"'<>\s\\]*)?/gi,
  ))
    if (isOfficialPdfUrl(match[0])) return new URL(match[0]).href;
}
