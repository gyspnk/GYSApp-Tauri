import assert from "node:assert/strict";
import { test } from "node:test";

import { fontPreloadTags, pickFontPreloads } from "./font-preload.mjs";

test("picks the hashed serif and sans files, never the italic or CJK face", () => {
  const files = [
    "source-serif-4-Bqx7Yb9M.woff2",
    "source-serif-4-italic-C46198CY.woff2",
    "gys-reading-sans-BES4ISry.woff2",
    "noto-serif-sc-DjsbZgil.woff2",
    "index-DeJsFGpY.js",
  ];
  assert.deepEqual(pickFontPreloads(files), [
    "source-serif-4-Bqx7Yb9M.woff2",
    "gys-reading-sans-BES4ISry.woff2",
  ]);
});

test("injects crossorigin preloads with the deployed base path", () => {
  const html = "<html><head><title>x</title></head><body></body></html>";
  const out = fontPreloadTags(
    html,
    ["source-serif-4-A1.woff2", "gys-reading-sans-B2.woff2"],
    "/GYSApp-Tauri/",
  );
  assert.match(out, /href="\/GYSApp-Tauri\/assets\/source-serif-4-A1\.woff2"/);
  assert.match(
    out,
    /href="\/GYSApp-Tauri\/assets\/gys-reading-sans-B2\.woff2"/,
  );
  assert.equal(out.match(/crossorigin/g)?.length, 2);
  assert.ok(out.indexOf("</head>") === out.lastIndexOf("</head>"));
});

test("leaves the document untouched when no font was emitted", () => {
  const html = "<html><head></head><body></body></html>";
  assert.equal(fontPreloadTags(html, ["index.js"]), html);
});
