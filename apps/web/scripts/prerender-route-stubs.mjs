// GitHub Pages answers unknown paths with 404.html, so a shared deep link such
// as /lainnya renders the app but carries a 404 status. Copy the shell to one
// directory per static route so those URLs answer 200; dynamic reader URLs keep
// falling back to 404.html, which still boots the app.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { injectBffHints, injectBffPreconnect } from "./bff-hints.mjs";
import { fontPreloadTags } from "./font-preload.mjs";
import {
  ROUTE_ENTRIES,
  entryPreloadTag,
  injectRoutePreload,
} from "./route-preload-tags.mjs";
import {
  hymnStubPaths,
  literatureStubPaths,
  suaraStubPaths,
} from "./hymn-stubs.mjs";

// Keep in sync with apps/web/src/static-routes.ts (a unit test enforces it).
const routes = [
  "sauh",
  "suara",
  "bible",
  "kidung",
  "iman",
  "literatur",
  "lainnya",
  "more",
  "alkitab",
];
const dist = join(process.cwd(), "dist");
const original = await readFile(join(dist, "index.html"), "utf8");
const base = original.match(/src="([^"]*?)assets\//)?.[1] ?? "/";
const assets = await readdir(join(dist, "assets"));
const shell = fontPreloadTags(original, assets, base);
// Home and /sauh start the live Sauh request from the document head so the
// hero image is not gated behind the entry chunk and the route chunk.
const bffBase = process.env.VITE_BFF_BASE_URL;
const hintedShell = injectBffHints(shell, bffBase);
// Every route paints BFF-proxied images; only the home and /sauh also preload
// the shelf JSON.
const preconnectShell = injectBffPreconnect(shell, bffBase);
// The manifest is a build artefact: if a future config stops emitting it, the
// stubs stay valid, they just lose the parallel route fetch.
const manifest = await readFile(join(dist, ".vite", "manifest.json"), "utf8")
  .then((raw) => JSON.parse(raw))
  .catch((error) => {
    console.warn(`route preload skipped: ${error.message}`);
    return {};
  });
// Start the route chunk with the entry instead of after it.
const withRoute = (html, entry) =>
  injectRoutePreload(html, entryPreloadTag(manifest, entry, base));
if (hintedShell !== original)
  await writeFile(
    join(dist, "index.html"),
    withRoute(hintedShell, ROUTE_ENTRIES["/"]),
  );

const catalog = JSON.parse(
  await readFile(
    join(process.cwd(), "public/offline/hymn-catalog.json"),
    "utf8",
  ),
);
const hymnRoutes = hymnStubPaths(catalog);
const literature = JSON.parse(
  await readFile(join(process.cwd(), "public/offline/literature.json"), "utf8"),
);
const literatureRoutes = literatureStubPaths(literature);
const suara = JSON.parse(
  await readFile(
    join(process.cwd(), "public/offline/suara-sejati.json"),
    "utf8",
  ),
);
const suaraRoutes = suaraStubPaths(suara);

for (const route of [
  ...routes,
  ...hymnRoutes,
  ...literatureRoutes,
  ...suaraRoutes,
]) {
  const target = join(dist, route, "index.html");
  await mkdir(dirname(target), { recursive: true });
  const entry =
    ROUTE_ENTRIES[`/${route}`] ??
    (hymnRoutes.includes(route)
      ? "src/kidung.tsx"
      : literatureRoutes.includes(route)
        ? "src/literature.tsx"
        : suaraRoutes.includes(route)
          ? "src/online-content.tsx"
          : undefined);
  await writeFile(
    target,
    withRoute(route === "sauh" ? hintedShell : preconnectShell, entry),
  );
}

console.log(
  `route stubs: ${routes.length} static + ${hymnRoutes.length} hymns + ${literatureRoutes.length} articles + ${suaraRoutes.length} testimonies`,
);
