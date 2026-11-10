import { afterEach, beforeEach, expect, it, vi } from "vitest";

let scripts: EventTarget[];
let rendered: Element[] = [];
const host = {
  getBoundingClientRect: () => ({ width: 320 }),
  replaceChildren: vi.fn(() => {
    rendered = [];
  }),
  get childElementCount() {
    return rendered.length;
  },
  get firstElementChild() {
    return rendered[0] ?? null;
  },
  dispatchEvent: vi.fn((event: Event) => {
    events.push(event.type);
    return true;
  }),
};
const events: string[] = [];
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  scripts = [];
  rendered = [];
  events.length = 0;
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
  const sdk = {
    initialize: vi.fn(),
    renderButton: vi.fn(() => {
      rendered = [{} as Element];
    }),
    cancel: vi.fn(),
  };
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

it("refuses to leave an empty host when Google renders no control", async () => {
  const { GOOGLE_UNAVAILABLE_EVENT, renderEgysGoogleButton } =
    await import("./egys-google.js");
  const sdk = installSdk();
  // An origin or client Google does not know: renderButton returns quietly.
  sdk.renderButton.mockImplementation(() => {});
  await expect(
    renderEgysGoogleButton(host as unknown as HTMLElement, vi.fn()),
  ).rejects.toThrow("rendered no sign-in control");
  expect(events).toEqual([GOOGLE_UNAVAILABLE_EVENT]);
  expect(host.replaceChildren).toHaveBeenCalled();
});

it("treats a zero-height control as no control at all", async () => {
  const { GOOGLE_UNAVAILABLE_EVENT, renderEgysGoogleButton } =
    await import("./egys-google.js");
  const sdk = installSdk();
  // An unregistered origin can also yield an iframe with no box: the row looks
  // pressable while nothing sits under the pointer.
  sdk.renderButton.mockImplementation(() => {
    rendered = [
      { getBoundingClientRect: () => ({ width: 0, height: 0 }) } as Element,
    ];
  });
  await expect(
    renderEgysGoogleButton(host as unknown as HTMLElement, vi.fn()),
  ).rejects.toThrow("rendered no sign-in control");
  expect(events).toEqual([GOOGLE_UNAVAILABLE_EVENT]);
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

it("guides every origin whose registration it cannot confirm", async () => {
  const {
    EGYS_GOOGLE_ORIGINS,
    EGYS_GOOGLE_PRODUCTION_ORIGIN,
    googleOriginNeedsGuidance,
  } = await import("./egys-google.js");
  expect(googleOriginNeedsGuidance(EGYS_GOOGLE_PRODUCTION_ORIGIN)).toBe(false);
  expect(googleOriginNeedsGuidance("")).toBe(false);
  for (const origin of EGYS_GOOGLE_ORIGINS) {
    if (origin === EGYS_GOOGLE_PRODUCTION_ORIGIN) continue;
    expect(googleOriginNeedsGuidance(origin)).toBe(true);
  }
  expect(googleOriginNeedsGuidance("http://192.168.1.4:5173")).toBe(true);
  expect(EGYS_GOOGLE_ORIGINS).toContain("http://127.0.0.1:4173");
});

function withTimers() {
  // The stubbed window is a bare object; the press helper needs timers on it.
  const win = window as unknown as {
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
  };
  win.setTimeout = setTimeout;
  win.clearTimeout = clearTimeout;
  return win;
}

function sdkStub(extra: Record<string, unknown> = {}) {
  const id = {
    initialize: vi.fn(),
    renderButton: vi.fn(),
    cancel: vi.fn(),
    ...extra,
  };
  (window as unknown as { google: unknown }).google = { accounts: { id } };
  return id;
}

it("reports a displayed Google prompt as an answer to the press", async () => {
  withTimers();
  const prompt = vi.fn((listener: (n: unknown) => void) =>
    listener({ isDisplayed: () => true }),
  );
  sdkStub({ prompt });
  const { pressEgysGoogle } = await import("./egys-google.js");
  await expect(pressEgysGoogle()).resolves.toBe("displayed");
  expect(prompt).toHaveBeenCalledTimes(1);
});

it("reports a prompt Google refuses to show as silence", async () => {
  withTimers();
  sdkStub({
    prompt: (listener: (n: unknown) => void) =>
      listener({ isNotDisplayed: () => true }),
  });
  const { pressEgysGoogle } = await import("./egys-google.js");
  await expect(pressEgysGoogle()).resolves.toBe("silent");
});

it("calls a missing prompt API silence instead of hanging", async () => {
  withTimers();
  sdkStub();
  const { pressEgysGoogle } = await import("./egys-google.js");
  await expect(pressEgysGoogle()).resolves.toBe("silent");
});

it("gives up on a prompt that never answers", async () => {
  withTimers();
  sdkStub({ prompt: vi.fn() });
  const { pressEgysGoogle } = await import("./egys-google.js");
  const outcome = pressEgysGoogle(1500);
  await vi.advanceTimersByTimeAsync(1500);
  await expect(outcome).resolves.toBe("silent");
});

it("calls prompt on Google's own client, not as a detached function", async () => {
  withTimers();
  const id = sdkStub();
  (id as unknown as { prompt: unknown }).prompt = function (
    this: unknown,
    listener: (n: unknown) => void,
  ) {
    // Google's client reads its state from `this`; a detached call throws.
    if (!this) throw new Error("detached prompt");
    listener({ isDisplayed: () => true });
  };
  const { pressEgysGoogle } = await import("./egys-google.js");
  await expect(pressEgysGoogle()).resolves.toBe("displayed");
});
