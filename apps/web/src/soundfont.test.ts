import { describe, expect, it, vi } from "vitest";
import { loadDefaultSoundfont } from "./soundfont.js";

describe("packaged MIDI bank", () => {
  it("surfaces an unreadable active bank instead of silently replacing its sound", async () => {
    const fetcher = vi.fn();
    await expect(
      loadDefaultSoundfont(fetcher, async () => {
        throw new Error("Active bank unreadable");
      }),
    ).rejects.toThrow("Active bank unreadable");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("plays with the bundled bank when no optional font is installed", async () => {
    const bytes = new Uint8Array(5_994_284);
    bytes.set(new TextEncoder().encode("sfbk"), 8);
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _options?: RequestInit) =>
        new Response(bytes),
    );
    const font = await loadDefaultSoundfont(fetcher, async () => undefined);
    expect(font.name).toBe("TimGM6mb");
    expect(font.bytes.byteLength).toBe(5_994_284);
    expect(fetcher.mock.calls[0]?.[0]).toContain(
      "assets/soundfont/TimGM6mb.sf2",
    );
  });

  it("uses installed GeneralUser without fetching another bank", async () => {
    const fetcher = vi.fn();
    const bytes = new Uint8Array([1, 2, 3]);
    expect(await loadDefaultSoundfont(fetcher, async () => bytes)).toEqual({
      name: "GeneralUser-GS",
      bytes,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects an incomplete bundled asset", async () => {
    await expect(
      loadDefaultSoundfont(
        async () => new Response("broken"),
        async () => undefined,
      ),
    ).rejects.toThrow("incomplete");
  });
});
