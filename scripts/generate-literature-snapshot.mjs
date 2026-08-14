import { mkdir, writeFile } from "node:fs/promises";

const source = "https://tjc.org/id/literatur/";
const pages = [
  ["kesaksian", source, "posts-table-1"],
  ["warta", source, "posts-table-2"],
  ["pelita-kecil", source, "posts-table-3"],
  ["panduan", source, "tb_9pdq304"],
  ["renungan", source, "tb_1uum169"],
];
const decode = (value) =>
  value
    .replace(/&#8211;|&#x2013;/gi, "–")
    .replace(/&#8217;|&#x27;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
const absolute = (value) => new URL(value, source).toString();
const items = [];
for (const [category, url, marker] of pages) {
  const html = await (
    await fetch(url, { headers: { accept: "text/html" } })
  ).text();
  const start = marker.startsWith("posts-")
    ? html.indexOf(`id="${marker}"`)
    : html.indexOf(`module module-accordion ${marker}`);
  const end = marker.startsWith("posts-")
    ? html.indexOf("</table>", start)
    : html.indexOf("<!-- /module accordion -->", start);
  if (start < 0 || end < 0) continue;
  const block = html.slice(start, end);
  for (const match of block.matchAll(
    /<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gis,
  )) {
    const href = absolute(match[1]);
    const title = decode(match[2]);
    if (!title || !href.startsWith("https://tjc.org/")) continue;
    const id = `${category}-${encodeURIComponent(href).replace(/%/g, "-").slice(0, 100)}`;
    if (items.some((item) => item.id === id)) continue;
    items.push({
      id,
      category,
      title,
      description: "Bahan bacaan dari portal resmi Gereja Yesus Sejati.",
      url: href,
      updatedAt: new Date().toISOString(),
      source: "tjc.org",
    });
  }
}
const catalog = {
  source: "tjc.org",
  generatedAt: new Date().toISOString(),
  items,
};
await mkdir("apps/web/public/offline", { recursive: true });
await writeFile(
  "apps/web/public/offline/literature.json",
  `${JSON.stringify(catalog, null, 2)}\n`,
);
console.log(`Generated ${items.length} literature links from ${source}`);
