import assert from "node:assert/strict";
import test from "node:test";
import { biblePackUrl, injectBiblePackFetch } from "./pack-hints.mjs";

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
