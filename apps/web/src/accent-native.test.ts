import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

test("native accent receives cold launch, changes, resume and configuration requests with normalized hex only", async () => {
  vi.resetModules();
  const colors: string[] = [];
  const windowStub = Object.assign(new EventTarget(), {
    localStorage: { getItem: () => "#fff", setItem() {}, removeItem() {} },
    GysStatusAccent: { postMessage: (color: string) => colors.push(color) },
  });
  const documentStub = Object.assign(new EventTarget(), {
    visibilityState: "visible",
    documentElement: { style: { setProperty() {}, removeProperty() {} } },
  });
  vi.stubGlobal("window", windowStub);
  vi.stubGlobal("document", documentStub);
  const { setAccentColor } = await import("./accent-color.js");
  expect(colors).toEqual(["#ffffff"]);
  setAccentColor("#0079a8");
  setAccentColor("#AbC");
  windowStub.dispatchEvent(new Event("pageshow"));
  documentStub.dispatchEvent(new Event("visibilitychange"));
  windowStub.dispatchEvent(new Event("gys-native-accent-request"));
  expect(colors).toEqual([
    "#ffffff",
    "#0079a8",
    "#aabbcc",
    "#aabbcc",
    "#aabbcc",
    "#aabbcc",
  ]);
  setAccentColor("red; anything");
  expect(colors).toHaveLength(6);
  windowStub.GysStatusAccent.postMessage = () => {
    throw new Error("destroyed webview");
  };
  expect(() => setAccentColor("#000000")).not.toThrow();
});
