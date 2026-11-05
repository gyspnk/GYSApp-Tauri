import assert from "node:assert/strict";
import test from "node:test";

import {
  bffHintTags,
  bffOrigin,
  injectBffHints,
  injectBffPreconnect,
  injectSuaraHints,
  sauhPreloadUrl,
  suaraCoverUrl,
} from "./bff-hints.mjs";

const BASE = "https://bff.example.workers.dev";

test("origin and preload url normalise the trailing slash", () => {
  assert.equal(bffOrigin(`${BASE}/`), BASE);
  assert.equal(sauhPreloadUrl(`${BASE}/`), `${BASE}/api/v1/content/sauh`);
});

test("unconfigured or malformed bases add nothing", () => {
  for (const base of [undefined, "", "   ", "not a url"]) {
    assert.equal(bffHintTags(base), "");
    assert.equal(injectBffHints("<head></head>", base), "<head></head>");
  }
});

test("tags preconnect the origin and preload the Sauh JSON", () => {
  const tags = bffHintTags(BASE);
  assert.match(
    tags,
    /<link rel="preconnect" href="https:\/\/bff\.example\.workers\.dev" crossorigin \/>/,
  );
  assert.match(
    tags,
    /<link rel="preload" as="fetch" href="https:\/\/bff\.example\.workers\.dev\/api\/v1\/content\/sauh" crossorigin="anonymous" \/>/,
  );
});

test("injection lands before the closing head tag once", () => {
  const html =
    "<!doctype html><html><head><title>x</title></head><body></body></html>";
  const out = injectBffHints(html, BASE);
  assert.equal(out.indexOf("preload"), out.lastIndexOf("preload"));
  assert.ok(out.indexOf("api/v1/content/sauh") < out.indexOf("</head>"));
  assert.ok(out.indexOf("</head>") < out.indexOf("<body>"));
});

test("a document without a head is returned unchanged", () => {
  assert.equal(
    injectBffHints("<html><body></body></html>", BASE),
    "<html><body></body></html>",
  );
});

test("injectBffPreconnect adds only the origin hint", () => {
  const html =
    "<!doctype html><html><head><title>x</title></head><body></body></html>";
  const out = injectBffPreconnect(html, "https://bff.example.workers.dev/");
  assert.match(
    out,
    /<link rel="preconnect" href="https:\/\/bff\.example\.workers\.dev" crossorigin \/>/,
  );
  assert.doesNotMatch(out, /rel="preload"/);
  assert.equal((out.match(/rel="preconnect"/g) || []).length, 1);
  assert.equal(injectBffPreconnect(html, ""), html);
  assert.equal(
    injectBffPreconnect("<html></html>", "https://bff.example.workers.dev"),
    "<html></html>",
  );
});

test("the Suara shell preloads the bundled snapshot", () => {
  const html =
    "<!doctype html><html><head><title>x</title></head><body></body></html>";
  const out = injectSuaraHints(
    html,
    "https://bff.example.workers.dev/",
    "/GYSApp-Tauri/",
  );
  assert.match(
    out,
    /<link rel="preload" as="fetch" href="\/GYSApp-Tauri\/offline\/suara-sejati\.json" crossorigin="anonymous" \/>/,
  );
  assert.equal((out.match(/rel="preconnect"/g) || []).length, 1);
  assert.equal((out.match(/rel="preload" as="fetch"/g) || []).length, 1);
  assert.equal(injectSuaraHints(html, "", "/GYSApp-Tauri/"), html);
  assert.equal(
    injectSuaraHints(html, "https://bff.example.workers.dev/", ""),
    html,
  );
});

test("the Suara shell preloads the first cover behind the image proxy", () => {
  const html =
    "<!doctype html><html><head><title>x</title></head><body></body></html>";
  const image = "https://cdn.example/cover-300x166.png";
  const proxied = suaraCoverUrl("https://bff.example.workers.dev", image);
  assert.equal(
    proxied,
    "https://bff.example.workers.dev/api/v1/content/image?url=https%3A%2F%2Fcdn.example%2Fcover-300x166.png",
  );
  const out = injectSuaraHints(
    html,
    "https://bff.example.workers.dev",
    "/GYSApp-Tauri/",
    image,
  );
  assert.match(
    out,
    /<link rel="preload" as="image" href="https:\/\/bff\.example\.workers\.dev\/api\/v1\/content\/image\?url=https%3A%2F%2Fcdn\.example%2Fcover-300x166\.png" \/>/,
  );
  // Without a usable cover the shell keeps only the snapshot preload.
  const plain = injectSuaraHints(
    html,
    "https://bff.example.workers.dev",
    "/GYSApp-Tauri/",
    "not-a-url",
  );
  assert.equal((plain.match(/as="image"/g) || []).length, 0);
  assert.equal(suaraCoverUrl("", image), undefined);
});
