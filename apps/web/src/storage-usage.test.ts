import { describe, expect, it } from "vitest";
import { readStorageUsage } from "./storage-usage.js";

describe("readStorageUsage", () => {
  it("returns nothing when the platform exposes no estimate", async () => {
    expect(await readStorageUsage(undefined)).toBeNull();
  });

  it("keeps the two numbers the platform reports", async () => {
    const usage = await readStorageUsage(async () => ({
      usage: 12_582_912,
      quota: 1_073_741_824,
    }));
    expect(usage).toEqual({ used: 12_582_912, quota: 1_073_741_824 });
  });

  it("refuses partial or impossible answers", async () => {
    expect(await readStorageUsage(async () => ({ usage: 5 }))).toBeNull();
    expect(
      await readStorageUsage(async () => ({ usage: 5, quota: 0 })),
    ).toBeNull();
    expect(
      await readStorageUsage(async () => ({ usage: Number.NaN, quota: 10 })),
    ).toBeNull();
  });

  it("stays quiet when the platform throws", async () => {
    expect(
      await readStorageUsage(async () => {
        throw new Error("denied");
      }),
    ).toBeNull();
  });
});
