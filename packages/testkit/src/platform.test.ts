import { describe, expect, it } from "vitest";
import { createMemoryPlatform } from "./platform.js";

describe("PlatformServices contract fixture", () => {
  it("provides isolated key-value and atomic blob storage", async () => {
    const services = createMemoryPlatform();
    expect(services.database.engine).toBe("memory");
    await services.secrets.set("ephemeral", "value");
    expect(await services.secrets.get("ephemeral")).toBe("value");
    expect(services.secrets.persistent).toBe(false);
    await services.keyValue.set("locale", "id");
    expect(await services.keyValue.get<string>("locale")).toBe("id");
    await services.blobs.putAtomic("pack", new Uint8Array([1, 2, 3]));
    const bytes = await services.blobs.get("pack");
    expect([...bytes!]).toEqual([1, 2, 3]);
    bytes![0] = 9;
    expect([...(await services.blobs.get("pack"))!]).toEqual([1, 2, 3]);
  });

  it("reports only capabilities implemented by the adapter", () => {
    const services = createMemoryPlatform();
    expect(services.hasCapability("audio")).toBe(true);
    expect(services.hasCapability("speech")).toBe(false);
  });
});
