import { describe, expect, it, vi } from "vitest";
import { clearStaleShellCaches } from "./chunk-recovery.js";

describe("stale chunk recovery", () => {
  it("preserves verified downloads and editorial caches", async () => {
    const remove = vi.fn().mockResolvedValue(true);
    await clearStaleShellCaches({
      keys: async () => [
        "gysapp-shell-v21",
        "gysapp-shell-v22",
        "gysapp-content-v1",
        "gysapp-blobs",
        "gys-midi-cache",
        "other-app-shell",
      ],
      delete: remove,
    });
    expect(remove.mock.calls).toEqual([
      ["gysapp-shell-v21"],
      ["gysapp-shell-v22"],
    ]);
  });

  it("continues when an individual shell cache cannot be deleted", async () => {
    const remove = vi
      .fn()
      .mockRejectedValueOnce(new Error("cache unavailable"))
      .mockResolvedValueOnce(true);
    await expect(
      clearStaleShellCaches({
        keys: async () => ["gysapp-shell-v21", "gysapp-shell-v22"],
        delete: remove,
      }),
    ).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
