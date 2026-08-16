import { describe, expect, it } from "vitest";
import {
  clearBrowserPlatformStorage,
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
  });

  it("exposes a safe reset boundary even when IndexedDB and Cache Storage are unavailable", async () => {
    await expect(clearBrowserPlatformStorage()).resolves.toBeUndefined();
  });
});
