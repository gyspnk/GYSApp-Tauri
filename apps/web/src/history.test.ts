import { afterEach, describe, expect, it, vi } from "vitest";
import { getActivity, setHymnActivity } from "./history.js";

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

describe("activity persistence", () => {
  const originalWindow = globalThis.window;
  const originalStorage = globalThis.localStorage;

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalStorage,
    });
  });

  it("does not emit duplicate identical hymn activity on a remount", () => {
    const storage = createStorage();
    const dispatchEvent = vi.fn();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: storage,
        dispatchEvent,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: storage,
    });
    setHymnActivity({ id: "hymn-001", title: "Pujilah", number: 1 }, 0);
    const first = getActivity().hymn?.updatedAt;
    setHymnActivity({ id: "hymn-001", title: "Pujilah", number: 1 }, 0);
    expect(getActivity().hymn?.updatedAt).toBe(first);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });
});
