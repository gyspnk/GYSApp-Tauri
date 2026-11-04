import { afterEach, describe, expect, it, vi } from "vitest";
import { createBundledBibleLoader } from "./bible-pack-loader.js";

const PACK = {
  version: 1,
  translation: "TB",
  source: "fixture",
  books: [{ id: 1, short: "Kej", name: "Kejadian", chapters: 50 }],
  verses: [
    {
      id: "1:1:1",
      book: "1",
      bookOrder: 1,
      chapter: 1,
      verse: 1,
      text: "Pada mulanya Allah menciptakan langit dan bumi.",
    },
  ],
};

async function gzBytes(value: unknown): Promise<ArrayBuffer> {
  const stream = new Blob([JSON.stringify(value)])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

const gz = async (value: unknown) =>
  new Response(await gzBytes(value), {
    headers: { "content-type": "application/gzip" },
  });
const plain = (value: unknown) => Response.json(value);

afterEach(() => vi.unstubAllGlobals());

describe("shared bundled Bible loading", () => {
  it("inflates the gzip sibling once and shares it across readers", async () => {
    const payload = await gz(PACK);
    const request = vi
      .fn()
      .mockImplementation(() => Promise.resolve(payload.clone()));
    vi.stubGlobal("fetch", request);
    const load = createBundledBibleLoader("/offline/bible/tb-reader.json");
    const first = load();
    expect(load()).toBe(first);
    const [reader, split, search] = await Promise.all([first, load(), load()]);
    expect(reader).toBe(split);
    expect(search).toBe(reader);
    expect(await load()).toBe(reader);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("/offline/bible/tb-reader.json.gz", {
      cache: "force-cache",
    });
  });

  it("falls back to the plain pack when the gzip file is missing", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(plain(PACK));
    vi.stubGlobal("fetch", request);
    const load = createBundledBibleLoader("/tb.json");
    await expect(load()).resolves.toMatchObject({ translation: "TB" });
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      "/tb.json.gz",
      "/tb.json",
    ]);
  });

  it("retries a failed request instead of poisoning the session cache", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(() => Promise.resolve(plain(PACK).clone()));
    vi.stubGlobal("fetch", request);
    const load = createBundledBibleLoader("/tb.json");
    await expect(load()).rejects.toThrow("offline");
    await expect(load()).resolves.toMatchObject({ translation: "TB" });
  });

  it("rejects invalid packs and retries HTTP failures", async () => {
    const invalid = await gz({ version: 99 });
    const valid = await gz(PACK);
    const request = vi
      .fn()
      .mockResolvedValueOnce(invalid)
      .mockResolvedValueOnce(valid);
    vi.stubGlobal("fetch", request);
    const load = createBundledBibleLoader("/tb.json");
    await expect(load()).rejects.toThrow("TB reader pack is invalid");
    await expect(load()).resolves.toMatchObject({ translation: "TB" });
  });

  it("reports a plain-pack failure when both paths fail", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", request);
    const load = createBundledBibleLoader("/tb.json");
    await expect(load()).rejects.toThrow("503");
  });
});
