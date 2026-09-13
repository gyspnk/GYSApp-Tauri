import { afterEach, describe, expect, it, vi } from "vitest";
import {
  autoFitTextSingleLine,
  observeSingleLineFit,
} from "./text-fit.js";

function fakeElement(initialWidth: number) {
  const style: Record<string, string> = {
    fontSize: "16px",
  };
  const element = {
    clientWidth: initialWidth,
    scrollWidth: 0,
    textContent: "Kejarlah Kemuliaan, berikan Yesus yang terindah",
    style: new Proxy(style, {
      get: (target, key) => target[key as string],
      set: (target, key, value) => {
        target[key as string] = String(value);
        // Simulate the browser shrinking measurable width with font size.
        const fontSize = Number.parseFloat(style.fontSize || "16");
        element.scrollWidth = Math.round(
          element.textContent.length * fontSize * 0.5,
        );
        return true;
      },
    }),
  };
  return element;
}

describe("single-line autofit (gyschordweb autoFitTextSingleLine)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps maxPx when the text already fits", () => {
    const element = fakeElement(10_000);
    autoFitTextSingleLine(element as unknown as HTMLElement, {
      maxPx: 16,
      minPx: 10,
    });
    expect(element.style.fontSize).toBe("16px");
    expect(element.style.whiteSpace).toBe("nowrap");
  });

  it("shrinks the font until the text fits with an ellipsis fallback", () => {
    const element = fakeElement(240);
    autoFitTextSingleLine(element as unknown as HTMLElement, {
      maxPx: 16,
      minPx: 10,
    });
    const applied = Number.parseFloat(element.style.fontSize || "16");
    expect(applied).toBeGreaterThanOrEqual(10);
    expect(applied).toBeLessThanOrEqual(16);
    expect(element.style.textOverflow).toBe("ellipsis");
  });

  it("scopes fitting to the observed container", () => {
    const inside = fakeElement(240);
    const outside = fakeElement(240);
    outside.style.fontSize = "23px";

    const container = {
      clientWidth: 320,
      querySelectorAll: vi.fn(() => [inside]),
    };
    const documentQuery = vi.fn(() => [inside, outside]);
    vi.stubGlobal("document", { querySelectorAll: documentQuery });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const cleanup = observeSingleLineFit(
      container as unknown as HTMLElement,
      ".fit",
      { maxPx: 16, minPx: 10 },
    );

    expect(container.querySelectorAll).toHaveBeenCalledWith(".fit");
    expect(documentQuery).not.toHaveBeenCalled();
    expect(outside.style.fontSize).toBe("23px");
    cleanup();
  });

  it("ignores height-only ResizeObserver updates", () => {
    const inside = fakeElement(240);
    const container = {
      clientWidth: 320,
      querySelectorAll: vi.fn(() => [inside]),
    };
    let resizeCallback:
      | ((entries: Array<{ contentRect: { width: number } }>) => void)
      | undefined;
    class FakeResizeObserver {
      constructor(
        callback: (entries: Array<{ contentRect: { width: number } }>) => void,
      ) {
        resizeCallback = callback;
      }
      observe() {}
      disconnect() {}
    }

    vi.stubGlobal("document", {});
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const cleanup = observeSingleLineFit(
      container as unknown as HTMLElement,
      ".fit",
      { maxPx: 16, minPx: 10 },
    );
    expect(inside.style.fontSize).not.toBe("23px");

    inside.style.fontSize = "23px";
    resizeCallback?.([{ contentRect: { width: 320 } }]);
    expect(inside.style.fontSize).toBe("23px");

    resizeCallback?.([{ contentRect: { width: 360 } }]);
    expect(inside.style.fontSize).not.toBe("23px");
    cleanup();
  });
});
