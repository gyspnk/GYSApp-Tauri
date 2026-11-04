// The route chunk is a dynamic import, so the browser starts it only after the
// entry chunk has run: on a slow link that is one extra round trip before the
// page can render. The prerendered shell knows the chunk already, so it can ask
// for it in the same breath as the entry.
export const ROUTE_ENTRIES = {
  "/": "src/home.tsx",
  "/sauh": "src/online-content.tsx",
  "/suara": "src/online-content.tsx",
  "/bible": "src/bible.tsx",
  "/alkitab": "src/bible.tsx",
  "/kidung": "src/kidung-page.tsx",
  "/iman": "src/faith.tsx",
  "/literatur": "src/literature.tsx",
  "/lainnya": "src/more.tsx",
  "/more": "src/more.tsx",
};

/** Chunk keys are source paths; every other manifest key is a shared chunk. */
export function routeChunkFile(manifest, entry) {
  const record = manifest?.[entry];
  return typeof record?.file === "string" ? record.file : undefined;
}

export function entryPreloadTag(manifest, entry, base) {
  const file = entry ? routeChunkFile(manifest, entry) : undefined;
  return file ? `<link rel="modulepreload" href="${base}${file}" />` : "";
}

export function routePreloadTags(manifest, route, base) {
  return entryPreloadTag(manifest, ROUTE_ENTRIES[route], base);
}

export function injectRoutePreload(html, tags) {
  if (!tags || !html.includes("</head>")) return html;
  return html.replace("</head>", `    ${tags}\n  </head>`);
}
