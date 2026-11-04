// GitHub Pages answers unknown paths with 404.html, so a shared deep link such
// as /lainnya renders the app but carries a 404 status. Copy the shell to one
// directory per static route so those URLs answer 200; dynamic reader URLs keep
// falling back to 404.html, which still boots the app.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { fontPreloadTags } from "./font-preload.mjs";
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
if (shell !== original) await writeFile(join(dist, "index.html"), shell);

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
  await writeFile(target, shell);
}

console.log(
  `route stubs: ${routes.length} static + ${hymnRoutes.length} hymns + ${literatureRoutes.length} articles + ${suaraRoutes.length} testimonies`,
);
