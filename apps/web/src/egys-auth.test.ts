import { describe, expect, it } from "vitest";
import { withTimeout } from "./egys-auth.js";

describe("e-GYS provider flow guards", () => {
  it("keeps a successful provider response", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 25)).resolves.toBe("ok");
  });

  it("rejects a provider that never completes", async () => {
    await expect(withTimeout(new Promise(() => undefined), 5)).rejects.toThrow(
      "provider login timed out",
    );
  });

  it("propagates cancellation instead of leaving auth busy forever", async () => {
    const controller = new AbortController();
    const pending = withTimeout(
      new Promise(() => undefined),
      1_000,
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
