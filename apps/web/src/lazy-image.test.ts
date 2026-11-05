import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getLazyImageState,
  readBrokenImages,
  rememberBrokenImage,
  resolveProxiedImageUrl,
} from "./lazy-image.js";

describe("getLazyImageState", () => {
  it.each([
    [undefined, false, false, "missing"],
    ["https://example.test/cover.jpg", false, false, "loading"],
    ["https://example.test/cover.jpg", true, false, "loaded"],
    ["https://example.test/cover.jpg", false, true, "error"],
  ] as const)("classifies %s as %s", (src, loaded, error, expected) => {
    expect(getLazyImageState(src, loaded, error)).toBe(expected);
  });
});

describe("resolveProxiedImageUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("preserves the small WordPress preview on the official mirror", () => {
    expect(
      resolveProxiedImageUrl(
        "https://tjc.org/id/wp-content/uploads/sites/43/2026/09/sauh-300x198.png",
      ),
    ).toBe(
      "https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/sites/43/2026/09/sauh-300x198.png",
    );
  });

  it("uses the existing BFF image proxy when configured", () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example");
    const resolved = resolveProxiedImageUrl(
      "https://tjc.org/id/wp-content/uploads/cover-300x200.jpg",
    );
    const url = new URL(resolved!);
    expect(url.origin).toBe("https://bff.example");
    expect(url.pathname).toBe("/api/v1/content/image");
    expect(url.searchParams.get("url")).toBe(
      "https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/cover-300x200.jpg",
    );
  });

  it("preserves mirror previews and leaves external URLs unchanged", () => {
    const mirror =
      "https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/cover-150x150.jpg";
    const external = "https://images.example/cover.jpg";
    expect(resolveProxiedImageUrl(mirror)).toBe(
      "https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/cover-150x150.jpg",
    );
    expect(resolveProxiedImageUrl(external)).toBe(external);
  });
});

describe("broken image memory", () => {
  const store = new Map<string, string>();
  const fakeStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };

  afterEach(() => {
    store.clear();
    vi.unstubAllGlobals();
  });

  it("remembers a failed URL and skips it for a week", () => {
    vi.stubGlobal("localStorage", fakeStorage);
    const url = "https://cdn.example/cover-300x220.jpg";
    rememberBrokenImage(url);
    expect(readBrokenImages().has(url)).toBe(true);
    const weekLater = Date.now() + 8 * 24 * 60 * 60_000;
    expect(readBrokenImages(weekLater).has(url)).toBe(false);
  });

  it("survives unreadable storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => "{not json",
      setItem: () => undefined,
      removeItem: () => undefined,
    });
    expect(readBrokenImages().size).toBe(0);
    expect(() =>
      rememberBrokenImage("https://cdn.example/a.jpg"),
    ).not.toThrow();
  });
});
