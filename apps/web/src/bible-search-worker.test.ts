import { afterEach, beforeEach, expect, it, vi } from "vitest";
const search = vi.hoisted(() => vi.fn(async () => []));
vi.mock("@gys/domain", () => ({
  BibleRepository: class {
    search = search;
  },
}));
let scope: {
  postMessage: ReturnType<typeof vi.fn>;
  onmessage: ((event: MessageEvent) => void) | null;
};
const send = (data: unknown) => scope.onmessage!({ data } as MessageEvent);
beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  search.mockReset().mockResolvedValue([]);
  scope = { postMessage: vi.fn(), onmessage: null };
  vi.stubGlobal("self", scope);
  await import("./bible-search-worker.js");
  send({ type: "init", verses: [] });
  scope.postMessage.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("cancels queued searches before they scan or transfer any results", async () => {
  send({ type: "search", id: 1, query: "old input", options: {} });
  send({ type: "cancel", id: 1 });
  await vi.runAllTimersAsync();
  expect(search).not.toHaveBeenCalled();
  expect(scope.postMessage).not.toHaveBeenCalled();
});

it("ignores late or unknown cancellations instead of retaining them for another request", async () => {
  send({ type: "cancel", id: 7 });
  send({ type: "search", id: 7, query: "current input", options: {} });
  await vi.runAllTimersAsync();
  expect(scope.postMessage).toHaveBeenCalledWith({
    type: "result",
    id: 7,
    verses: [],
  });
});

it("reinitializing the worker retires searches from the previous verse index", async () => {
  send({ type: "search", id: 1, query: "old version", options: {} });
  send({ type: "init", verses: [] });
  send({ type: "search", id: 2, query: "new version", options: {} });
  await vi.runAllTimersAsync();
  expect(search).toHaveBeenCalledTimes(1);
  expect(scope.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ id: 1 }),
  );
  expect(scope.postMessage).toHaveBeenCalledWith({
    type: "result",
    id: 2,
    verses: [],
  });
});

it("does not transfer a late result from an already-running cancelled search", async () => {
  let finish!: (verses: never[]) => void;
  search.mockImplementationOnce(
    () =>
      new Promise<never[]>((resolve) => {
        finish = resolve;
      }),
  );
  send({ type: "search", id: 1, query: "old pending result", options: {} });
  await vi.advanceTimersByTimeAsync(0);
  expect(search).toHaveBeenCalledOnce();
  send({ type: "cancel", id: 1 });
  send({ type: "search", id: 2, query: "latest query", options: {} });
  finish([]);
  await vi.runAllTimersAsync();
  expect(scope.postMessage).toHaveBeenCalledOnce();
  expect(scope.postMessage).toHaveBeenCalledWith({
    type: "result",
    id: 2,
    verses: [],
  });
});
