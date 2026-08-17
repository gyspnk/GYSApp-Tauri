import { describe, expect, it, vi } from "vitest";
import { hapticTick } from "./haptics.js";

describe("hapticTick", () => {
  it("calls navigator.vibrate with appropriate duration for light tick", () => {
    const vibrateMock = vi.fn();
    vi.stubGlobal("navigator", { vibrate: vibrateMock });

    hapticTick("light");
    expect(vibrateMock).toHaveBeenCalledWith(10);
    vi.unstubAllGlobals();
  });

  it("calls navigator.vibrate with appropriate duration for medium tick", () => {
    const vibrateMock = vi.fn();
    vi.stubGlobal("navigator", { vibrate: vibrateMock });

    hapticTick("medium");
    expect(vibrateMock).toHaveBeenCalledWith(25);
    vi.unstubAllGlobals();
  });

  it("defaults to light tick when no type provided", () => {
    const vibrateMock = vi.fn();
    vi.stubGlobal("navigator", { vibrate: vibrateMock });

    hapticTick();
    expect(vibrateMock).toHaveBeenCalledWith(10);
    vi.unstubAllGlobals();
  });

  it("gracefully handles absence of navigator.vibrate", () => {
    vi.stubGlobal("navigator", {});
    expect(() => hapticTick("light")).not.toThrow();
    vi.unstubAllGlobals();
  });

  it("gracefully catches thrown errors from navigator.vibrate", () => {
    const vibrateMock = vi.fn().mockImplementation(() => {
      throw new Error("NotAllowedError");
    });
    vi.stubGlobal("navigator", { vibrate: vibrateMock });

    expect(() => hapticTick("light")).not.toThrow();
    vi.unstubAllGlobals();
  });
});
