import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOfficialPdf } from "./pdf-proxy.js";

afterEach(() => vi.useRealTimers());

describe("official PDF streaming", () => {
  it("uses the upload CDN first and preserves partial content without buffering", async () => {
    const upstream = new Response("%PDF-", {
      status: 206,
      headers: {
        "content-type": "application/pdf",
        "content-range": "bytes 0-4/90000000",
      },
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(upstream);
    const result = await fetchOfficialPdf(
      new URL("https://tjc.org/id/wp-content/uploads/sites/43/book.pdf"),
      "bytes=0-4",
      new AbortController().signal,
      fetcher,
    );
    expect(result).toBe(upstream);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/sites/43/book.pdf",
    );
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("range")).toBe(
      "bytes=0-4",
    );
  });

  it("bounds header waits, falls back, and leaves a slow PDF body readable", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            signal = init?.signal as AbortSignal;
            signal.addEventListener("abort", () => reject(signal?.reason), {
              once: true,
            });
          }),
      )
      .mockResolvedValueOnce(
        new Response("%PDF-", {
          headers: { "content-type": "application/pdf" },
        }),
      );
    const loading = fetchOfficialPdf(
      new URL(
        "https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/sites/43/book.pdf",
      ),
      undefined,
      new AbortController().signal,
      fetcher,
    );
    await vi.advanceTimersByTimeAsync(8_000);
    const result = await loading;
    expect(signal?.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetcher.mock.calls[1]?.[1]?.signal?.aborted).toBe(false);
    expect(await result?.text()).toBe("%PDF-");
  });

  it("does not retry after the reader cancels", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      fetchOfficialPdf(
        new URL("https://tjc.org/file.pdf"),
        undefined,
        controller.signal,
        fetcher,
      ),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
