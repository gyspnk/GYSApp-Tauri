import assert from "node:assert/strict";
import test from "node:test";

import {
  bffHintTags,
  bffOrigin,
  injectBffHints,
  injectBffPreconnect,
  injectBffSuaraHints,
  sauhPreloadUrl,
  suaraFeedUrl,
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

test("the Suara shell preloads the BFF feed with anonymous credentials", () => {
  const html =
    "<!doctype html><html><head><title>x</title></head><body></body></html>";
  const out = injectBffSuaraHints(html, "https://bff.example.workers.dev/");
  assert.equal(
    suaraFeedUrl("https://bff.example.workers.dev/"),
    "https://bff.example.workers.dev/api/v1/content/suara-sejati",
  );
  assert.match(
    out,
    /<link rel="preload" as="fetch" href="https:\/\/bff\.example\.workers\.dev\/api\/v1\/content\/suara-sejati" crossorigin="anonymous" \/>/,
  );
  assert.equal((out.match(/rel="preconnect"/g) || []).length, 1);
  assert.equal((out.match(/rel="preload"/g) || []).length, 1);
  assert.equal(injectBffSuaraHints(html, ""), html);
  assert.equal(
    injectBffSuaraHints("<html></html>", "https://bff.example.workers.dev"),
    "<html></html>",
  );
});
