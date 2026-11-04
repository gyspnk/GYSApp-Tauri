import { afterEach, describe, expect, it, vi } from "vitest";
import { prefetchOnIdle } from "./idle-prefetch.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("prefetchOnIdle", () => {
  it("warms the snapshot from an idle callback", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}"));
    let idle: (() => void) | undefined;
    vi.stubGlobal("window", {
      requestIdleCallback: (callback: () => void) => {
        idle = callback;
        return 1;
      },
      cancelIdleCallback: vi.fn(),
      setTimeout: (callback: () => void) => {
        callback();
        return 1;
      },
      clearTimeout: vi.fn(),
    });
    const cancel = prefetchOnIdle("/offline/suara-sejati.json", { fetcher });
    expect(fetcher).not.toHaveBeenCalled();
    idle?.();
    expect(fetcher).toHaveBeenCalledWith("/offline/suara-sejati.json", {
      cache: "force-cache",
      credentials: "same-origin",
    });
    cancel();
  });

  it("stays quiet when data saving is on", () => {
    const fetcher = vi.fn();
    prefetchOnIdle("/offline/suara-sejati.json", {
      fetcher,
      connection: { saveData: true },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("stays quiet on a 2G link", () => {
    const fetcher = vi.fn();
    prefetchOnIdle("/offline/suara-sejati.json", {
      fetcher,
      connection: { effectiveType: "2g" },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
