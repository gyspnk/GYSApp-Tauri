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

afterEach(() => vi.unstubAllGlobals());

describe("shared bundled Bible loading", () => {
  it("shares one fetch, parse and object across concurrent readers", async () => {
    const json = vi.fn().mockResolvedValue(PACK);
    const request = vi.fn().mockResolvedValue({ ok: true, json });
    vi.stubGlobal("fetch", request);
    const load = createBundledBibleLoader("/offline/bible/tb-reader.json");
    const first = load();
    expect(load()).toBe(first);
    const [reader, split, search] = await Promise.all([first, load(), load()]);
    expect(reader).toBe(split);
    expect(search).toBe(reader);
    expect(await load()).toBe(reader);
    expect(request).toHaveBeenCalledTimes(1);
    expect(json).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("/offline/bible/tb-reader.json", {
      cache: "force-cache",
    });
  });

  it("retries a failed request instead of poisoning the session cache", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ ok: true, json: async () => PACK });
    vi.stubGlobal("fetch", request);
    const load = createBundledBibleLoader("/tb.json");
    await expect(load()).rejects.toThrow("offline");
    await expect(load()).resolves.toMatchObject({ translation: "TB" });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid packs and retries HTTP failures", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ version: 99 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => PACK });
    vi.stubGlobal("fetch", request);
    const load = createBundledBibleLoader("/tb.json");
    await expect(load()).rejects.toThrow("503");
    await expect(load()).rejects.toThrow("TB reader pack is invalid");
    await expect(load()).resolves.toMatchObject({ translation: "TB" });
  });
});
