import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let saved: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  saved = new Map();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("hymn presentation session", () => {
  it("accepts text and PDF; chord remains a capability", async () => {
    const { isHymnViewerMode } = await import("./hymn-view-mode.js");
    expect(isHymnViewerMode("lyrics")).toBe(true);
    expect(isHymnViewerMode("pdf")).toBe(true);
    expect(isHymnViewerMode("chord")).toBe(false);
  });
  it("ignores a legacy persisted PDF mode and remembers a switch within the app", async () => {
    saved.set(
      "gys-hymn-view-mode-v1",
      JSON.stringify({ version: 1, modes: { "hymn-001": "pdf" } }),
    );
    const mode = await import("./hymn-view-mode.js");
    expect(mode.readHymnViewerMode()).toBe("lyrics");
    mode.writeHymnViewerMode("pdf");
    expect(mode.readHymnViewerMode()).toBe("pdf");
  });
  it("starts a new app runtime in text while keeping the saved chord preference", async () => {
    const first = await import("./hymn-view-mode.js");
    first.writeHymnViewerMode("pdf");
    first.writeHymnChordVisibility("hymn-001", true);
    vi.resetModules();
    const reopened = await import("./hymn-view-mode.js");
    expect(reopened.readHymnViewerMode()).toBe("lyrics");
    expect(reopened.readHymnChordVisibility("hymn-001")).toBe(true);
  });
});
