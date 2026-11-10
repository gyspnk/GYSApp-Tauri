import assert from "node:assert/strict";
import test from "node:test";
import {
  biblePackUrl,
  hymnMetadataUrl,
  injectBiblePackFetch,
  injectHymnMetadataPreload,
} from "./pack-hints.mjs";

test("builds one URL with a single trailing slash", () => {
  assert.equal(
    biblePackUrl("/GYSApp-Tauri/"),
    "/GYSApp-Tauri/offline/bible/tb-reader.json.gz",
  );
  assert.equal(
    biblePackUrl("/GYSApp-Tauri"),
    "/GYSApp-Tauri/offline/bible/tb-reader.json.gz",
  );
});

test("injects the fetch before the closing head", () => {
  const html = injectBiblePackFetch(
    "<head><title>x</title></head><body></body>",
    "/GYSApp-Tauri/",
  );
  assert.match(
    html,
    /window\.__gysBiblePack=fetch\("\/GYSApp-Tauri\/offline\/bible\/tb-reader\.json\.gz",\{cache:"force-cache"\}\)\.catch\(\(\)=>undefined\)/,
  );
  assert.ok(html.indexOf("tb-reader.json.gz") < html.indexOf("</head>"));
});

test("is idempotent and leaves a headless document alone", () => {
  const once = injectBiblePackFetch("<head></head>", "/");
  assert.equal(injectBiblePackFetch(once, "/"), once);
  assert.equal(injectBiblePackFetch("<body></body>", "/"), "<body></body>");
});

test("hymn metadata preload is emitted once for the catalogue shell", () => {
  const html =
    "<!doctype html><html><head><title>t</title></head><body></body></html>";
  const once = injectHymnMetadataPreload(html, "/GYSApp-Tauri/");
  assert.match(
    once,
    /rel="preload" as="fetch" href="\/GYSApp-Tauri\/offline\/hymn-metadata\.json" crossorigin="anonymous"/,
  );
  assert.equal(injectHymnMetadataPreload(once, "/GYSApp-Tauri/"), once);
  assert.equal(
    injectHymnMetadataPreload("<p>no head</p>", "/x/"),
    "<p>no head</p>",
  );
  assert.equal(hymnMetadataUrl("/x"), "/x/offline/hymn-metadata.json");
});
