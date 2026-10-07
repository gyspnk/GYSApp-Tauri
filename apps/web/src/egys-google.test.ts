import { afterEach, beforeEach, expect, it, vi } from "vitest";

let scripts: EventTarget[];
const host = {
  getBoundingClientRect: () => ({ width: 320 }),
  replaceChildren: vi.fn(),
};
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  scripts = [];
  vi.stubGlobal("window", {});
  vi.stubGlobal("document", {
    querySelector: () => null,
    createElement: () =>
      Object.assign(new EventTarget(), { dataset: {}, remove: vi.fn() }),
    head: { appendChild: (script: EventTarget) => scripts.push(script) },
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function installSdk() {
  const sdk = { initialize: vi.fn(), renderButton: vi.fn(), cancel: vi.fn() };
  window.google = { accounts: { id: sdk } };
  return sdk;
}

it("retries a timed-out Google SDK instead of retaining a failed script", async () => {
  const { renderEgysGoogleButton } = await import("./egys-google.js");
  const failed = expect(
    renderEgysGoogleButton(host as unknown as HTMLElement, vi.fn()),
  ).rejects.toThrow("timed out");
  expect((scripts[0] as HTMLScriptElement).src).toBe(
    "https://accounts.google.com/gsi/client?hl=id",
  );
  await vi.advanceTimersByTimeAsync(10_000);
  await failed;
  const retry = renderEgysGoogleButton(host as unknown as HTMLElement, vi.fn());
  const sdk = installSdk();
  expect(scripts).toHaveLength(2);
  scripts[1]!.dispatchEvent(new Event("load"));
  const dispose = await retry;
  expect(sdk.renderButton).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  dispose();
});

it("a late SDK cannot initialize a provider control after its route unmounts", async () => {
  const { renderEgysGoogleButton } = await import("./egys-google.js");
  const controller = new AbortController();
  const render = renderEgysGoogleButton(
    host as unknown as HTMLElement,
    vi.fn(),
    undefined,
    { signal: controller.signal },
  );
  controller.abort();
  const sdk = installSdk();
  scripts[0]!.dispatchEvent(new Event("load"));
  await render;
  expect(sdk.initialize).not.toHaveBeenCalled();
  expect(sdk.renderButton).not.toHaveBeenCalled();
});

it("an old provider callback cannot sign in after the inline control is disposed", async () => {
  const sdk = installSdk();
  const complete = vi.fn();
  const { renderEgysGoogleButton } = await import("./egys-google.js");
  const dispose = await renderEgysGoogleButton(
    host as unknown as HTMLElement,
    complete,
  );
  const callback = sdk.initialize.mock.calls[0]![0].callback;
  callback({ credential: "current" });
  expect(complete).toHaveBeenCalledWith("current");
  dispose();
  callback({ credential: "stale" });
  expect(complete).toHaveBeenCalledOnce();
});
