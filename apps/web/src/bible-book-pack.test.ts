import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bibleBookPackUrl,
  clearBibleBookPacks,
  loadBibleBookPack,
} from "./bible-pack-loader";

const BOOK = {
  version: 1,
  translation: "TB",
  book: { id: "1", name: "Kejadian" },
  verses: [
    { id: "1:1:1", book: "1", chapter: 1, verse: 1, text: "Pada mulanya" },
  ],
  pericopes: [],
};

async function gzip(value: unknown): Promise<Uint8Array> {
  const stream = new Blob([JSON.stringify(value)])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function mockFetch(handler: (url: string) => Promise<Response> | Response) {
  const spy = vi.fn(async (input: RequestInfo | URL) => handler(String(input)));
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  clearBibleBookPacks();
  vi.unstubAllGlobals();
});

describe("loadBibleBookPack", () => {
  it("fetches the gzipped book and parses it", async () => {
    const spy = mockFetch(async () => new Response(await gzip(BOOK)));
    const pack = await loadBibleBookPack("1");
    expect(pack.book.name).toBe("Kejadian");
    expect(pack.verses).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toBe(bibleBookPackUrl("1"));
  });

  it("shares one request for concurrent readers", async () => {
    const spy = mockFetch(async () => new Response(await gzip(BOOK)));
    const [a, b] = await Promise.all([
      loadBibleBookPack("1"),
      loadBibleBookPack("1"),
    ]);
    expect(a).toBe(b);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("accepts a body the host already inflated", async () => {
    mockFetch(async () => new Response(JSON.stringify(BOOK)));
    const pack = await loadBibleBookPack("1");
    expect(pack.verses[0]?.text).toBe("Pada mulanya");
  });

  it("rejects a failed request and retries on the next call", async () => {
    const spy = mockFetch(async () => new Response("nope", { status: 503 }));
    await expect(loadBibleBookPack("1")).rejects.toThrow("503");
    mockFetch(async () => new Response(await gzip(BOOK)));
    await expect(loadBibleBookPack("1")).resolves.toMatchObject({
      translation: "TB",
    });
  });
});
