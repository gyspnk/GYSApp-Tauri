import { describe, expect, it, vi } from "vitest";
import {
  fetchPdfTotalBytes,
  parseContentRangeTotal,
} from "./pdf-remote-size.js";

describe("parseContentRangeTotal", () => {
  it("reads the total from a range response", () => {
    expect(parseContentRangeTotal("bytes 0-0/90868320")).toBe(90868320);
  });

  it("rejects headers without a total", () => {
    expect(parseContentRangeTotal("bytes 0-0/*")).toBeUndefined();
    expect(parseContentRangeTotal(null)).toBeUndefined();
    expect(parseContentRangeTotal("")).toBeUndefined();
  });
});

describe("fetchPdfTotalBytes", () => {
  it("sends a one-byte range and returns the total", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(null, {
          status: 206,
          headers: { "content-range": "bytes 0-0/1234" },
        }),
    );
    expect(
      await fetchPdfTotalBytes("/pdf", fetcher as unknown as typeof fetch),
    ).toBe(1234);
    expect(fetcher).toHaveBeenCalledWith("/pdf", {
      headers: { range: "bytes=0-0" },
    });
  });

  it("returns undefined when the request fails", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(
      await fetchPdfTotalBytes("/pdf", fetcher as unknown as typeof fetch),
    ).toBeUndefined();
  });
});
