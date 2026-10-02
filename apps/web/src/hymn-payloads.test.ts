import { afterEach, expect, it, vi } from "vitest";
import { createHymnPayloadLoader } from "./hymn-payloads.js";

afterEach(() => vi.unstubAllGlobals());
it("catalog and search share parsed core data without a consumer aborting it", async () => {
  const parse = vi.fn((value) => value);
  const fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ items: ["pinned"] }),
  }));
  vi.stubGlobal("fetch", fetch);
  const load = createHymnPayloadLoader("/core.json", parse);
  const [catalog, search] = await Promise.all([load(), load()]);
  expect(catalog).toBe(search);
  expect(fetch).toHaveBeenCalledOnce();
  expect(parse).toHaveBeenCalledOnce();
});
it("failed or invalid core data can be retried", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
  vi.stubGlobal("fetch", fetch);
  const load = createHymnPayloadLoader("/core.json", (value) => value);
  await expect(load()).rejects.toThrow("unavailable");
  await expect(load()).resolves.toEqual({ items: [] });
  expect(fetch).toHaveBeenCalledTimes(2);
});
