// @ts-nocheck - the module reads DOM globals that this Node test stubs.
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, Response>();
const cache = {
  keys: async () => [...store.keys()].map((url) => ({ url })),
  match: async (key: string | { url: string }) =>
    store.get(typeof key === "string" ? key : key.url),
  put: async (key: string | { url: string }, value: Response) => {
    store.set(typeof key === "string" ? key : key.url, value);
  },
  delete: async () => true,
};

function payload(text: string) {
  const bytes = new TextEncoder().encode(text);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { bytes, sha256 };
}

function item(path: string, sha256: string, size: number) {
  return { id: path, kind: "pdf", path, sha256, size };
}

beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", { caches: true });
  vi.stubGlobal("caches", { open: async () => cache });
});

describe("cachedByPath", () => {
  it("finds the payload under a different cache key", async () => {
    const { bytes, sha256 } = payload("hymn-pdf");
    store.set(
      "https://cdn.example/assets/pdf/051A_Batu%20Zaman.pdf?commit=abc1234",
      new Response(bytes),
    );
    const { cachedByPath } = await import("./music-assets.js");
    const found = await cachedByPath(
      item("assets/pdf/051A_Batu Zaman.pdf", sha256, bytes.byteLength),
    );
    expect(found && [...found]).toEqual([...bytes]);
  });

  it("skips entries whose bytes do not match and keeps looking", async () => {
    const wanted = payload("real");
    const decoy = payload("decoy");
    store.set(
      "https://a.example/x/assets/pdf/x.pdf",
      new Response(decoy.bytes),
    );
    store.set(
      "https://b.example/y/assets/pdf/x.pdf?commit=def5678",
      new Response(wanted.bytes),
    );
    const { cachedByPath } = await import("./music-assets.js");
    const found = await cachedByPath(
      item("assets/pdf/x.pdf", wanted.sha256, wanted.bytes.byteLength),
    );
    expect(found && [...found]).toEqual([...wanted.bytes]);
  });

  it("returns undefined when the cache holds no matching path", async () => {
    const { cachedByPath } = await import("./music-assets.js");
    const found = await cachedByPath(
      item("assets/pdf/missing.pdf", "0".repeat(64), 4),
    );
    expect(found).toBeUndefined();
  });
});
