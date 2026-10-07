import { afterEach, describe, expect, it, vi } from "vitest";
import { bffPdfUrl } from "./pdf-source.js";

describe("public PDF routing", () => {
  afterEach(() => vi.unstubAllEnvs());
  const source =
    "https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/book.pdf";
  it("uses the public Worker in production when the optional build variable is empty", () => {
    vi.stubEnv("VITE_BFF_BASE_URL", " ");
    vi.stubEnv("DEV", false);
    expect(bffPdfUrl(source)).toBe(
      `https://gysapp-tauri-bff.pas-presensi.workers.dev/api/v1/content/pdf?url=${encodeURIComponent(source)}`,
    );
  });
  it("honors a configured proxy and preserves packaged/unrelated PDF sources", () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://custom.example/");
    expect(bffPdfUrl(source)).toContain(
      "https://custom.example/api/v1/content/pdf?",
    );
    expect(bffPdfUrl("/GYSApp-Tauri/assets/pdf/001.pdf")).toBe(
      "/GYSApp-Tauri/assets/pdf/001.pdf",
    );
    expect(bffPdfUrl("https://other.example/book.pdf")).toBe(
      "https://other.example/book.pdf",
    );
  });
});
