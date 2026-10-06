import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("react-dom", () => ({ flushSync: (update: () => void) => update() }));
const classes = new Set<string>();
beforeEach(() => {
  vi.resetModules();
  classes.clear();
  vi.stubGlobal("window", { scrollTo: vi.fn() });
  vi.stubGlobal("scrollX", 0);
  vi.stubGlobal("scrollY", 120);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("document", {
    documentElement: {
      classList: {
        add: (key: string) => classes.add(key),
        remove: (...keys: string[]) =>
          keys.forEach((key) => classes.delete(key)),
      },
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("fades a single snapshot and cleans up after completion", async () => {
  const update = vi.fn();
  const finished = Promise.resolve();
  document.startViewTransition = vi.fn((callback) => {
    (callback as () => void)();
    return { finished, skipTransition: vi.fn() } as unknown as ViewTransition;
  });
  const { transitionTheme } = await import("./theme-transition.js");
  transitionTheme(update);
  expect(update).toHaveBeenCalledOnce();
  expect(classes.has("is-theme-transition")).toBe(true);
  await finished;
  await Promise.resolve();
  await Promise.resolve();
  expect(classes.size).toBe(0);
});
it("rapid changes discard outdated snapshot callbacks", async () => {
  const callbacks: Array<() => void> = [];
  const skip = vi.fn();
  document.startViewTransition = vi.fn((callback) => {
    callbacks.push(callback as () => void);
    return {
      finished: new Promise(() => {}),
      skipTransition: skip,
    } as unknown as ViewTransition;
  });
  const { transitionTheme } = await import("./theme-transition.js");
  const first = vi.fn(),
    last = vi.fn();
  transitionTheme(first);
  transitionTheme(last);
  callbacks[1]!();
  callbacks[0]!();
  expect(skip).toHaveBeenCalledOnce();
  expect(first).not.toHaveBeenCalled();
  expect(last).toHaveBeenCalledOnce();
});
it("reduced motion updates immediately without snapshots", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  document.startViewTransition = vi.fn();
  const { transitionTheme } = await import("./theme-transition.js");
  const update = vi.fn();
  transitionTheme(update);
  expect(update).toHaveBeenCalledOnce();
  expect(document.startViewTransition).not.toHaveBeenCalled();
  expect(classes.size).toBe(0);
});
it("unsupported browsers use a short color transition and clean up", async () => {
  vi.useFakeTimers();
  const { transitionTheme } = await import("./theme-transition.js");
  const update = vi.fn();
  transitionTheme(update);
  expect(update).toHaveBeenCalledOnce();
  expect(classes.has("is-theme-color-transition")).toBe(true);
  vi.advanceTimersByTime(280);
  expect(classes.size).toBe(0);
});
