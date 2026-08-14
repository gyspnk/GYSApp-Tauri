import {
  LiteratureCatalogSchema,
  type LiteratureCategory,
  type LiteratureCatalog,
} from "@gys/contracts";

const SOURCE = "https://tjc.org/id/literatur/";
const sections: Array<[LiteratureCategory, string]> = [
  ["kesaksian", "posts-table-1"],
  ["warta", "posts-table-2"],
  ["pelita-kecil", "posts-table-3"],
  ["panduan", "tb_9pdq304"],
  ["renungan", "tb_1uum169"],
];

function decode(value: string) {
  return value
    .replace(/&#8211;|&#x2013;/gi, "–")
    .replace(/&#8217;|&#x27;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function absolute(value: string) {
  return new URL(value, SOURCE).toString();
}

export async function fetchLiteratureCatalog(
  sourceUrl = SOURCE,
): Promise<LiteratureCatalog> {
  const html = await (
    await fetch(sourceUrl, { headers: { accept: "text/html" } })
  ).text();
  const items: LiteratureCatalog["items"] = [];
  for (const [category, marker] of sections) {
    const start = marker.startsWith("posts-")
      ? html.indexOf(`id="${marker}"`)
      : html.indexOf(`module module-accordion ${marker}`);
    const end = marker.startsWith("posts-")
      ? html.indexOf("</table>", start)
      : html.indexOf("<!-- /module accordion -->", start);
    if (start < 0 || end < 0) continue;
    for (const match of html
      .slice(start, end)
      .matchAll(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gis)) {
      const href = match[1];
      const rawTitle = match[2];
      if (!href || !rawTitle) continue;
      const url = absolute(href);
      const title = decode(rawTitle);
      if (!title || !url.startsWith("https://tjc.org/")) continue;
      const id = `${category}-${encodeURIComponent(url).replace(/%/g, "-").slice(0, 100)}`;
      if (items.some((item) => item.id === id)) continue;
      items.push({
        id,
        category,
        title,
        description: "Bahan bacaan dari portal resmi Gereja Yesus Sejati.",
        url,
        updatedAt: new Date().toISOString(),
        source: "tjc.org",
      });
    }
  }
  return LiteratureCatalogSchema.parse({
    source: "tjc.org",
    generatedAt: new Date().toISOString(),
    items,
  });
}
