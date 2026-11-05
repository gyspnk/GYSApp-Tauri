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

// The route chunk then dynamically imports its data module and fetches a JSON
// shelf: two more serial round trips on a slow link. Both are known at build
// time, so the shell can start them together with the route chunk.
export const ROUTE_DATA = {
  "/suara": { chunks: ["src/suara.ts"], files: ["offline/suara-sejati.json"] },
  "/literatur": {
    chunks: ["src/literature-catalog.ts"],
    files: ["offline/literature.json"],
  },
  "/sauh": { chunks: [], files: ["offline/sauh.json"] },
  "/iman": { chunks: ["src/faith-payloads.ts"], files: ["offline/faith.json"] },
  "/kidung": { chunks: ["src/hymn-payloads.ts"], files: [] },
};

/** Chunk keys are source paths; every other manifest key is a shared chunk. */
export function routeChunkFile(manifest, entry) {
  const record = manifest?.[entry];
  if (typeof record?.file === "string") return record.file;
  // Shared chunks are keyed by their emitted basename (`_suara-*.js`), not by a
  // source path, so fall back to the file prefix.
  const name = entry
    .split("/")
    .pop()
    ?.replace(/\.[a-z]+$/, "");
  if (!name) return undefined;
  for (const value of Object.values(manifest ?? {})) {
    const file = typeof value?.file === "string" ? value.file : "";
    if (file.includes(`/${name}-`) || file.includes(`/_${name}-`)) return file;
  }
  return undefined;
}

export function entryPreloadTag(manifest, entry, base) {
  const file = entry ? routeChunkFile(manifest, entry) : undefined;
  return file ? `<link rel="modulepreload" href="${base}${file}" />` : "";
}

export function routeDataTags(manifest, route, base) {
  const spec = ROUTE_DATA[route];
  if (!spec) return "";
  const tags = spec.chunks
    .map((key) => routeChunkFile(manifest, key))
    .filter(Boolean)
    .map((file) => `<link rel="modulepreload" href="${base}${file}" />`);
  for (const file of spec.files)
    tags.push(
      `<link rel="preload" as="fetch" href="${base}${file}" crossorigin="anonymous" />`,
    );
  return tags.join("\n    ");
}

export function routePreloadTags(manifest, route, base) {
  return [
    entryPreloadTag(manifest, ROUTE_ENTRIES[route], base),
    routeDataTags(manifest, route, base),
  ]
    .filter(Boolean)
    .join("\n    ");
}

export function injectRoutePreload(html, tags) {
  if (!tags || !html.includes("</head>")) return html;
  return html.replace("</head>", `    ${tags}\n  </head>`);
}
