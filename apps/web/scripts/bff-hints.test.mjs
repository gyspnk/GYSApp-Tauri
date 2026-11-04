import assert from "node:assert/strict";
import test from "node:test";

import {
  bffHintTags,
  bffOrigin,
  injectBffHints,
  sauhPreloadUrl,
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
