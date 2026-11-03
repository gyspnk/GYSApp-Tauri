import { describe, expect, it, vi } from "vitest";
import { withDeadline } from "./with-deadline.js";

describe("withDeadline", () => {
  it("returns the work result when it settles first", async () => {
    await expect(
      withDeadline(Promise.resolve("ready"), 50, "fallback"),
    ).resolves.toBe("ready");
  });

  it("returns the fallback when the work never settles", async () => {
    vi.useFakeTimers();
    const pending = new Promise<string>(() => undefined);
    const result = withDeadline(pending, 1_000, "fallback");
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(result).resolves.toBe("fallback");
    vi.useRealTimers();
  });

  it("keeps the work rejection when it fails first", async () => {
    await expect(
      withDeadline(Promise.reject(new Error("boom")), 50, "fallback"),
    ).rejects.toThrow("boom");
  });
});
