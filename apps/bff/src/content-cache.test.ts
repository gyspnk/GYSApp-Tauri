import { expect, it, vi } from "vitest";
import { ContentCache, contentEtag } from "./content-cache.js";

it("serves warm and stale content immediately while sharing one background refresh", async () => {
  let now = 0;
  const cache = new ContentCache<string>(100, 1000, 2, () => now);
  const first = vi.fn(async () => "cached");
  expect(
    await Promise.all([cache.get("a", first), cache.get("a", first)]),
  ).toEqual(["cached", "cached"]);
  expect(first).toHaveBeenCalledOnce();
  now = 101;
  let release!: (value: string) => void;
  const pending = new Promise<string>((resolve) => {
    release = resolve;
  });
  const refresh = vi.fn(() => pending);
  const deferred: Promise<unknown>[] = [];
  expect(
    await Promise.all(
      Array.from({ length: 8 }, () =>
        cache.get("a", refresh, (task) => deferred.push(task)),
      ),
    ),
  ).toEqual(Array(8).fill("cached"));
  expect(refresh).toHaveBeenCalledOnce();
  release("updated");
  await Promise.all(deferred);
  expect(await cache.get("a", first)).toBe("updated");
  expect(first).toHaveBeenCalledOnce();
});

it("keeps a usable stale response on upstream failure and backs off retries", async () => {
  let now = 0;
  const cache = new ContentCache<string>(100, 60_000, 2, () => now);
  await cache.get("a", async () => "offline copy");
  now = 101;
  const fail = vi.fn(async () => {
    throw new Error("offline");
  });
  const deferred: Promise<unknown>[] = [];
  expect(await cache.get("a", fail, (task) => deferred.push(task))).toBe(
    "offline copy",
  );
  await Promise.all(deferred);
  expect(await cache.get("a", fail)).toBe("offline copy");
  expect(fail).toHaveBeenCalledOnce();
  now = 61_000;
  await expect(cache.get("a", fail)).rejects.toThrow("offline");
});

it("bounds stored content and pending requests without evicting recently read content", async () => {
  const cache = new ContentCache<string>(1000, 1000, 2, () => 0);
  const load = vi.fn(async () => "value");
  await cache.get("a", load);
  await cache.get("b", load);
  await cache.get("a", load);
  await cache.get("c", load);
  await cache.get("a", load);
  expect(load).toHaveBeenCalledTimes(3);
  await cache.get("b", load);
  expect(load).toHaveBeenCalledTimes(4);
  let release!: () => void;
  const wait = new Promise<string>((resolve) => {
    release = () => resolve("new");
  });
  const first = cache.get("d", () => wait);
  const second = cache.get("e", () => wait);
  await expect(cache.get("f", () => wait)).rejects.toThrow("busy");
  release();
  await Promise.all([first, second]);
});

it("detects same-length edits anywhere in public content", async () => {
  expect(
    await contentEtag([
      { id: "first", body: "AB" },
      { id: "last", body: "CD" },
    ]),
  ).not.toBe(
    await contentEtag([
      { id: "first", body: "AB" },
      { id: "last", body: "EF" },
    ]),
  );
});
