import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("preload and repeated faith visits share one validated payload", async () => {
  const data = {
    faith: [
      {
        language: "ID",
        title: "Dasar Kepercayaan",
        content: [{ number: "1", text: "Full statement" }],
      },
    ],
  };
  const fetch = vi.fn(async () => new Response(JSON.stringify(data)));
  vi.stubGlobal("fetch", fetch);
  const { loadFaithPack, getCachedFaithPack } =
    await import("./faith-payloads.js");
  const [preloaded, opened] = await Promise.all([
    loadFaithPack(),
    loadFaithPack(),
  ]);
  expect(preloaded).toBe(opened);
  expect(getCachedFaithPack()).toBe(opened);
  expect(await loadFaithPack()).toBe(opened);
  expect(fetch).toHaveBeenCalledOnce();
});

it("an invalid faith payload can be retried without caching incomplete statements", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"faith":[{"language":"ID","content":[{}]}]}'),
      )
      .mockResolvedValue(
        new Response(
          '{"faith":[{"language":"ID","title":"Iman","content":[{"number":"1","text":"Complete"}]}]}',
        ),
      ),
  );
  const { loadFaithPack } = await import("./faith-payloads.js");
  await expect(loadFaithPack()).rejects.toThrow("invalid");
  await expect(loadFaithPack()).resolves.toMatchObject({
    faith: [{ content: [{ text: "Complete" }] }],
  });
});
