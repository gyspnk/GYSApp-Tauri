/**
 * The Alkitab reader cannot paint until its 1,7 MB pack arrives. The pack
 * request used to start only after React mounted (~6 s on a slow link), so the
 * parser-level fetch below overlaps it with the entry chunk instead.
 *
 * A `<link rel="preload" as="fetch">` does not work here: the loader fetches
 * with CORS credentials and Chromium refuses to reuse a no-cors preload
 * ("request credentials mode does not match"). Calling the same `fetch()` the
 * loader will call keeps one cache entry.
 */
export function biblePackUrl(rootBase) {
  const base = rootBase.endsWith("/") ? rootBase : `${rootBase}/`;
  return `${base}offline/bible/tb-reader.json.gz`;
}

export function biblePackFetchTag(rootBase) {
  const url = JSON.stringify(biblePackUrl(rootBase));
  // Store the promise so the loader reuses the response instead of issuing a
  // second 1,7 MB request.
  return `<script>window.__gysBiblePack=fetch(${url},{cache:"force-cache"}).catch(()=>undefined)</script>`;
}

export function injectBiblePackFetch(html, rootBase) {
  if (!html.includes("</head>")) return html;
  if (html.includes("tb-reader.json.gz", html.indexOf("<head"))) return html;
  return html.replace("</head>", `  ${biblePackFetchTag(rootBase)}\n  </head>`);
}

/**
 * The kidung catalogue paints its first row only after `hymn-metadata.json`
 * arrives. The request used to start after the entry chunk; preloading it from
 * the shell overlaps the download with boot. Same-origin, so no credentials
 * mismatch (the reason `<link rel=preload as=fetch>` failed for the Bible pack).
 */
export function hymnMetadataUrl(rootBase) {
  const base = rootBase.endsWith("/") ? rootBase : `${rootBase}/`;
  return `${base}offline/hymn-metadata.json`;
}

export function injectHymnMetadataPreload(html, rootBase) {
  if (!html.includes("</head>")) return html;
  if (html.includes("hymn-metadata.json", html.indexOf("<head"))) return html;
  const tag = `<link rel="preload" as="fetch" href="${hymnMetadataUrl(rootBase)}" crossorigin="anonymous" />`;
  return html.replace("</head>", `  ${tag}\n  </head>`);
}

/**
 * `/literatur` fetches its 160 KB catalogue snapshot only after the shell
 * mounts; preloading it from the stub overlaps the download with boot, the same
 * trick that moved the kidung catalogue forward.
 */
export function literatureSnapshotUrl(rootBase) {
  const base = rootBase.endsWith("/") ? rootBase : `${rootBase}/`;
  return `${base}offline/literature.json`;
}

export function injectLiteraturePreload(html, rootBase) {
  if (!html.includes("</head>")) return html;
  if (html.includes("literature.json", html.indexOf("<head"))) return html;
  const tag = `<link rel="preload" as="fetch" href="${literatureSnapshotUrl(rootBase)}" crossorigin="anonymous" />`;
  return html.replace("</head>", `  ${tag}\n  </head>`);
}
