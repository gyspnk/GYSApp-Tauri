import { describe, expect, it, vi } from "vitest";
import { reserveAuthPopup, withTimeout } from "./egys-auth.js";

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

  it("reports a genuinely blocked popup instead of treating noopener as blocked", () => {
    const open = vi.fn(() => null);
    vi.stubGlobal("window", { open });
    try {
      expect(reserveAuthPopup()).toBeUndefined();
      expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("severs the opener before an auth popup can navigate", () => {
    const popup = { opener: {} as Window } as unknown as Window;
    const open = vi.fn(() => popup);
    vi.stubGlobal("window", { open });
    try {
      expect(reserveAuthPopup()).toBe(popup);
      expect(popup.opener).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
