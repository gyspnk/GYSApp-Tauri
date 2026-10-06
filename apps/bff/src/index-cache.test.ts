import { afterEach, expect, it, vi } from "vitest";
import { createApp } from "./index.js";

const manifest = {
  version: 1 as const,
  sourceRepo: "gyspnk/gyschordweb",
  sourceCommit: "a3d1ea7",
  generatedAt: "2026-08-14T00:00:00.000Z",
  entries: [],
};
it("catalog validators detect same-size edits beyond the first item", async () => {
  const initial = ["first", "last"].map((id) => ({
    id,
    kind: "announcement" as const,
    title: id,
    body: "AB",
    url: `https://tjc.org/id/${id}/`,
    source: "tjc.org",
    updatedAt: "2026-10-06T00:00:00Z",
  }));
  const before = createApp({
    allowedOrigins: [],
    chordManifest: manifest,
    content: initial,
  });
  const response = await before.request("/api/v1/content/catalog");
  const etag = response.headers.get("etag")!;
  const after = createApp({
    allowedOrigins: [],
    chordManifest: manifest,
    content: initial.map((item) =>
      item.id === "last" ? { ...item, body: "CD" } : item,
    ),
  });
  const updated = await after.request("/api/v1/content/catalog", {
    headers: { "if-none-match": etag },
  });
  expect(updated.status).toBe(200);
  expect(updated.headers.get("etag")).not.toBe(etag);
  const stable = await after.request("/api/v1/content/catalog", {
    headers: { "if-none-match": updated.headers.get("etag")! },
  });
  expect(stable.status).toBe(304);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("public article requests paint stale content, refresh once through waitUntil, and keep a stable ETag", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T00:00:00Z"));
  const html =
    "<html><title>Artikel</title><article><p>Published article text.</p></article></html>";
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => new Response(html));
  vi.stubGlobal("fetch", fetch);
  const app = createApp({
    allowedOrigins: [],
    chordManifest: manifest,
    content: [],
  });
  const path = `/api/v1/content/article?url=${encodeURIComponent("https://tjc.org/id/test-article/")}`;
  const initial = await Promise.all([
    app.request(path),
    app.request(path),
    app.request(path),
  ]);
  expect(initial.every((response) => response.status === 200)).toBe(true);
  expect(fetch).toHaveBeenCalledOnce();
  const etag = initial[0]!.headers.get("etag")!;
  const first = await initial[0]!.json();
  vi.setSystemTime(new Date("2026-10-06T00:11:00Z"));
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  fetch.mockImplementation(async () => {
    await wait;
    return new Response(html);
  });
  const background: Promise<unknown>[] = [];
  const context = {
    waitUntil: (task: Promise<unknown>) => {
      background.push(task);
    },
    passThroughOnException: () => {},
    props: {},
  };
  const stale = await app.request(path, undefined, {}, context);
  expect(stale.status).toBe(200);
  expect(await stale.json()).toEqual(first);
  const conditional = await app.request(
    path,
    { headers: { "if-none-match": etag } },
    {},
    context,
  );
  expect(conditional.status).toBe(304);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(background.length).toBeGreaterThan(0);
  release();
  await Promise.all(background);
  const refreshed = await app.request(path, {
    headers: { "if-none-match": etag },
  });
  expect(refreshed.status).toBe(304);
  fetch.mockResolvedValue(new Response(html.replace("Published", "Refreshed")));
  vi.setSystemTime(new Date("2026-10-06T00:22:00Z"));
  await app.request(path, undefined, {}, context);
  await Promise.all(background);
  const changed = await app.request(path, {
    headers: { "if-none-match": etag },
  });
  expect(changed.status).toBe(200);
  expect(changed.headers.get("etag")).not.toBe(etag);
  expect(JSON.stringify(await changed.json())).toContain("Refreshed");
});
