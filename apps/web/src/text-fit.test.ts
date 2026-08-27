import { describe, expect, it, vi, afterEach } from "vitest";
import { autoFitTextSingleLine } from "./text-fit.js";

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
  afterEach(() => vi.restoreAllMocks());

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
});
