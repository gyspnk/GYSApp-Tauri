import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDiagnostics,
  recordDiagnostic,
  subscribeDiagnostics,
} from "./diagnostics.js";

function installStorage() {
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
  const browserWindow = {
    localStorage,
    location: { pathname: "/diagnostics" },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: browserWindow,
  });
  vi.stubGlobal("localStorage", localStorage);
  return localStorage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("diagnostic journal", () => {
  it("redacts bearer and token-like values before persistence", () => {
    installStorage();

    const event = recordDiagnostic(
      "error",
      "oauth",
      new Error(
        "authorization=Bearer abc123 token=secret id_token=provider-secret",
      ),
    );

    expect(event.message).not.toContain("abc123");
    expect(event.message).not.toContain("secret");
    expect(event.message).not.toContain("provider-secret");
    expect(getDiagnostics()).toEqual([event]);
  });

  it("keeps the journal bounded and notifies subscribers", () => {
    const storage = installStorage();
    const listener = vi.fn();
    const unsubscribe = subscribeDiagnostics(listener);

    for (let index = 0; index < 85; index += 1) {
      const event = recordDiagnostic("warn", "cache", `event-${index}`);
      if (index === 0) {
        expect(storage.getItem("gys-diagnostics-v1")).not.toBeNull();
        expect(getDiagnostics()).toHaveLength(1);
      }
    }

    expect(getDiagnostics()).toHaveLength(80);
    expect(getDiagnostics()[0]?.message).toBe("event-5");
    expect(getDiagnostics().at(-1)?.message).toBe("event-84");
    expect(listener).toHaveBeenCalledTimes(85);
    unsubscribe();
  });
});
