import assert from "node:assert/strict";
import { test } from "node:test";

import { normaliseSnapshot, sourceUrl } from "./fetch-sauh-snapshot.mjs";

const item = {
  id: "sbj261104",
  title: "Hidup dalam Kasih",
  reference: "Yohanes 13:34",
  verse: "Aku memberikan perintah baru kepada kamu",
  body: "Kasih bukan sekadar perasaan.",
  url: "https://tjc.org/id/gerakan-baca-alkitab/",
  imageUrl: "https://tjcorguploads.s3.amazonaws.com/hero.jpg",
  updatedAt: "2026-11-04T00:00:00.000Z",
  source: "tjc",
};

test("builds the snapshot url only when a base is configured", () => {
  assert.equal(sourceUrl(undefined), undefined);
  assert.equal(sourceUrl("  "), undefined);
  assert.equal(
    sourceUrl("https://bff.example.workers.dev/"),
    "https://bff.example.workers.dev/api/v1/content/sauh",
  );
});

test("accepts the wrapped shelf shape and keeps every field", () => {
  const snapshot = normaliseSnapshot({ items: [item] });
  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0].id, "sbj261104");
  assert.equal(snapshot.items[0].imageUrl, item.imageUrl);
});

test("accepts a bare array", () => {
  assert.equal(normaliseSnapshot([item]).items.length, 1);
});

test("rejects payloads the reader could not render", () => {
  assert.equal(normaliseSnapshot(undefined), undefined);
  assert.equal(normaliseSnapshot({ items: [] }), undefined);
  assert.equal(normaliseSnapshot({ items: [{ ...item, id: "" }] }), undefined);
  assert.equal(
    normaliseSnapshot({ items: [{ ...item, url: "http://tjc.org/x" }] }),
    undefined,
  );
  assert.equal(
    normaliseSnapshot({ items: [{ ...item, updatedAt: "not a date" }] }),
    undefined,
  );
});
