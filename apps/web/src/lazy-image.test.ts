import { describe, expect, it } from "vitest";
import { resolveProxiedImageUrl } from "./lazy-image.js";

describe("resolveProxiedImageUrl", () => {
  it("uses the official original S3 asset without an image-proxy hop", () => {
    expect(
      resolveProxiedImageUrl(
        "https://tjc.org/id/wp-content/uploads/sites/43/2026/09/sauh-300x198.png",
      ),
    ).toBe(
      "https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/sites/43/2026/09/sauh.png",
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
