import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ROUTE_ENTRIES,
  injectRoutePreload,
  routeChunkFile,
  routePreloadTags,
} from "./route-preload-tags.mjs";

const manifest = {
  "src/faith.tsx": { file: "assets/faith-hd0aYUCk.js", isDynamicEntry: true },
  "src/kidung.tsx": { file: "assets/kidung-CH_VeX4n.js", isDynamicEntry: true },
  "src/kidung-page.tsx": {
    file: "assets/kidung-page-DyzRtWg8.js",
    isDynamicEntry: true,
  },
};

test("maps each static route to its chunk", () => {
  assert.equal(
    routePreloadTags(manifest, "/iman", "/GYSApp-Tauri/"),
    '<link rel="modulepreload" href="/GYSApp-Tauri/assets/faith-hd0aYUCk.js" />',
  );
  assert.equal(
    routePreloadTags(manifest, "/kidung", "/"),
    '<link rel="modulepreload" href="/assets/kidung-page-DyzRtWg8.js" />',
  );
});

test("the kidung catalogue and the reader are different chunks", () => {
  assert.equal(ROUTE_ENTRIES["/kidung"], "src/kidung-page.tsx");
  assert.notEqual(ROUTE_ENTRIES["/kidung"], "src/kidung.tsx");
});

test("unknown routes and missing manifest entries emit nothing", () => {
  assert.equal(routePreloadTags(manifest, "/tidak-ada", "/"), "");
  assert.equal(routePreloadTags(manifest, "/bible", "/"), "");
  assert.equal(routeChunkFile(undefined, "src/faith.tsx"), undefined);
  assert.equal(
    routeChunkFile({ "src/faith.tsx": {} }, "src/faith.tsx"),
    undefined,
  );
});

test("injects one tag before </head> and ignores headless documents", () => {
  const html = "<html><head><title>x</title></head><body></body></html>";
  const out = injectRoutePreload(
    html,
    '<link rel="modulepreload" href="/a.js" />',
  );
  assert.ok(
    out.includes('    <link rel="modulepreload" href="/a.js" />\n  </head>'),
  );
  assert.equal(injectRoutePreload(html, ""), html);
  assert.equal(
    injectRoutePreload("<p>x</p>", '<link rel="modulepreload" href="/a.js" />'),
    "<p>x</p>",
  );
});
