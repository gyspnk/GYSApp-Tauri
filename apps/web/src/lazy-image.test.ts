import { afterEach, describe, expect, it, vi } from "vitest";
import { getLazyImageState, resolveProxiedImageUrl } from "./lazy-image.js";

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

  it("normalizes a WordPress derivative to the official original", () => {
    expect(
      resolveProxiedImageUrl(
        "https://tjc.org/id/wp-content/uploads/sites/43/2026/09/sauh-300x198.png",
      ),
    ).toBe(
      "https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/sites/43/2026/09/sauh.png",
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
      "https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/cover.jpg",
    );
  });

  it("restores originals from official mirror derivatives and leaves external URLs unchanged", () => {
    const mirror =
      "https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/cover-150x150.jpg";
    const external = "https://images.example/cover.jpg";
    expect(resolveProxiedImageUrl(mirror)).toBe(
      "https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/cover.jpg",
    );
    expect(resolveProxiedImageUrl(external)).toBe(external);
  });
});
