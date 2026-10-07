import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("literature PDF metadata cache", () => {
  const source = "https://tjc.org/id/pelitakecil/pk46/";
  const pdf =
    "https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/Pelita.pdf";
  let saved: Map<string, string>;
  beforeEach(() => {
    vi.resetModules();
    saved = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("shares concurrent resolution and reuses a persisted validated source after restart", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ url: pdf })));
    vi.stubGlobal("fetch", fetcher);
    const module = await import("./literature-pdf-source.js");
    expect(
      await Promise.all([
        module.resolveIssuePdfUrl(source),
        module.resolveIssuePdfUrl(source),
      ]),
    ).toEqual([pdf, pdf]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.resetModules();
    expect(
      await (
        await import("./literature-pdf-source.js")
      ).resolveIssuePdfUrl(source),
    ).toBe(pdf);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("falls back to publisher metadata with bounded requests when an older worker lacks the route", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("Not found", { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { content: { rendered: `<a href="${pdf}">PDF</a>` } },
          ]),
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(
      await (
        await import("./literature-pdf-source.js")
      ).resolveIssuePdfUrl(source),
    ).toBe(pdf);
    expect(String(fetcher.mock.calls[1]![0])).toContain("_fields=content");
    expect(
      fetcher.mock.calls.every(
        ([, options]) => options.signal instanceof AbortSignal,
      ),
    ).toBe(true);
  });

  it("does not cache failure, allowing a new request to recover", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: pdf })));
    vi.stubGlobal("fetch", fetcher);
    const { resolveIssuePdfUrl } = await import("./literature-pdf-source.js");
    expect(await resolveIssuePdfUrl(source)).toBeUndefined();
    expect(await resolveIssuePdfUrl(source)).toBe(pdf);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("expires cached metadata and refuses a foreign PDF returned by the proxy", async () => {
    saved.set(
      "gys-literature-pdf-sources-v1",
      JSON.stringify([
        [source, { url: pdf, at: Date.now() - 25 * 60 * 60_000 }],
      ]),
    );
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: "https://evil.example/file.pdf" })),
      )
      .mockResolvedValueOnce(new Response("[]"));
    vi.stubGlobal("fetch", fetcher);
    const module = await import("./literature-pdf-source.js");
    expect(module.getCachedIssuePdfUrl(source)).toBeUndefined();
    expect(await module.resolveIssuePdfUrl(source)).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
