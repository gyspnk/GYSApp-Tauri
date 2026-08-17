import { describe, expect, it, vi } from "vitest";
import {
  clearBrowserPlatformStorage,
  clearPlatformStorage,
  createBrowserPlatformServices,
} from "./platform.js";

describe("browser platform binary boundary", () => {
  it("keeps an atomic blob independent from the caller's mutable buffer", async () => {
    const services = createBrowserPlatformServices();
    const input = Uint8Array.from([7, 11, 19]);

    await services.blobs.putAtomic("chord/demo", input);
    input[0] = 255;

    await expect(services.blobs.get("chord/demo")).resolves.toEqual(
      Uint8Array.from([7, 11, 19]),
    );
    await services.blobs.remove("chord/demo");
    await expect(services.blobs.get("chord/demo")).resolves.toBeUndefined();
    expect(services.database.engine).toBe("indexeddb");
    expect(services.secrets.persistent).toBe(false);
  });

  it("exposes a safe reset boundary even when IndexedDB and Cache Storage are unavailable", async () => {
    await expect(clearBrowserPlatformStorage()).resolves.toBeUndefined();
  });

  it("clears webview caches after the native app-data reset", async () => {
    const originalCaches = (globalThis as { caches?: unknown }).caches;
    const originalTauri = (globalThis as { __TAURI__?: unknown }).__TAURI__;
    const calls: string[] = [];
    const deleted: string[] = [];
    vi.stubGlobal("__TAURI__", {
      invoke: async (command: string) => {
        calls.push(command);
      },
    });
    vi.stubGlobal("caches", {
      keys: async () => ["gys-assets-v1-demo", "unrelated-cache"],
      delete: async (name: string) => {
        deleted.push(name);
        return true;
      },
    });

    try {
      await clearPlatformStorage();
      expect(calls).toEqual(["platform_clear_data"]);
      expect(deleted).toEqual(["gys-assets-v1-demo"]);
    } finally {
      if (originalCaches === undefined)
        delete (globalThis as { caches?: unknown }).caches;
      else vi.stubGlobal("caches", originalCaches);
      if (originalTauri === undefined)
        delete (globalThis as { __TAURI__?: unknown }).__TAURI__;
      else vi.stubGlobal("__TAURI__", originalTauri);
    }
  });
});
