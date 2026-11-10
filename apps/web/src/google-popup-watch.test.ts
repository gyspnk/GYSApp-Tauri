import { describe, expect, it, vi } from "vitest";
import { watchGooglePopup } from "./google-popup-watch.js";

function fakeWindow(open: () => unknown): Window {
  return { open } as unknown as Window;
}

describe("watchGooglePopup", () => {
  it("reports a blocked popup", () => {
    const view = fakeWindow(() => null);
    const watch = watchGooglePopup(view);
    expect(view.open("https://accounts.google.com", "_blank")).toBe(null);
    expect(watch.attempted).toBe(true);
    expect(watch.blocked).toBe(true);
    watch.restore();
  });

  it("leaves an allowed popup alone", () => {
    const opened = { closed: false };
    const view = fakeWindow(() => opened);
    const watch = watchGooglePopup(view);
    expect(view.open("https://accounts.google.com", "_blank")).toBe(opened);
    expect(watch.attempted).toBe(true);
    expect(watch.blocked).toBe(false);
    expect(watch.opened).toBe(true);
    watch.restore();
  });

  it("restores the original open", () => {
    const original = vi.fn(() => null);
    const view = fakeWindow(original);
    const watch = watchGooglePopup(view);
    watch.restore();
    view.open("https://accounts.google.com");
    expect(original).toHaveBeenCalledOnce();
  });
});
