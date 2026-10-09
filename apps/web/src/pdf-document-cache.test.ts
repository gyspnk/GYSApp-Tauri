import { afterEach, expect, it, vi } from "vitest";
vi.mock("pdfjs-dist", () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: {},
}));
import { createPdfDocumentCache } from "./pdf-document-cache.js";

afterEach(() => vi.useRealTimers());
function setup() {
  const tasks: Array<{
    promise: Promise<string>;
    destroy: ReturnType<typeof vi.fn>;
    onProgress?: (p: { loaded: number; total: number }) => void;
  }> = [];
  const create = vi.fn((src: string) => {
    const task = {
      promise: Promise.resolve(src),
      destroy: vi.fn(async () => {}),
    };
    tasks.push(task);
    return task;
  });
  return { tasks, create, cache: createPdfDocumentCache(create, 1000, 2) };
}
it("shares an in-flight PDF with reader/chord leases and relays progress only to active readers", async () => {
  vi.useFakeTimers();
  const { cache, create, tasks } = setup();
  const firstProgress = vi.fn(),
    secondProgress = vi.fn();
  const first = cache.acquire("master.pdf", undefined, firstProgress);
  const second = cache.acquire("master.pdf", undefined, secondProgress);
  expect(first.promise).toBe(second.promise);
  expect(create).toHaveBeenCalledOnce();
  tasks[0]!.onProgress?.({ loaded: 10, total: 100 });
  expect(secondProgress).toHaveBeenCalledOnce();
  first.release();
  first.release();
  tasks[0]!.onProgress?.({ loaded: 50, total: 100 });
  expect(firstProgress).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1001);
  expect(tasks[0]!.destroy).not.toHaveBeenCalled();
  second.release();
  await vi.advanceTimersByTimeAsync(1001);
  expect(tasks[0]!.destroy).toHaveBeenCalledOnce();
});
it("revisiting cancels expiry and LRU evicts only idle workers", async () => {
  vi.useFakeTimers();
  const { cache, tasks, create } = setup();
  const active = cache.acquire("active.pdf");
  cache.acquire("a.pdf").release();
  await vi.advanceTimersByTimeAsync(500);
  const revisited = cache.acquire("a.pdf");
  cache.acquire("b.pdf").release();
  cache.acquire("c.pdf").release();
  expect(tasks[1]!.destroy).not.toHaveBeenCalled();
  revisited.release();
  expect(tasks[2]!.destroy).toHaveBeenCalledOnce();
  expect(tasks[0]!.destroy).not.toHaveBeenCalled();
  expect(create).toHaveBeenCalledTimes(4);
  cache.clearIdle();
  expect(tasks[1]!.destroy).toHaveBeenCalledOnce();
  expect(tasks[3]!.destroy).toHaveBeenCalledOnce();
  active.release();
  cache.clearIdle();
});
it("never aliases different offline documents or mutates their byte buffers", () => {
  vi.useFakeTimers();
  const { cache, create } = setup();
  const bytes = new Uint8Array([37, 80, 68, 70]);
  cache.acquire("blob:first", bytes).release();
  cache.acquire("blob:second", bytes).release();
  cache.acquire("", bytes.slice()).release();
  expect(create).toHaveBeenCalledTimes(2);
  expect([...bytes]).toEqual([37, 80, 68, 70]);
  cache.clearIdle();
});
it("failed parse removes its worker so a subsequent open can recover", async () => {
  vi.useFakeTimers();
  const destroy = vi.fn(async () => {});
  const create = vi
    .fn()
    .mockReturnValueOnce({
      promise: Promise.reject(new Error("offline")),
      destroy,
    })
    .mockReturnValue({
      promise: Promise.resolve("ready"),
      destroy: vi.fn(async () => {}),
    });
  const cache = createPdfDocumentCache<string>(create, 1000);
  const failed = cache.acquire("same.pdf");
  await expect(failed.promise).rejects.toThrow("offline");
  failed.release();
  const recovered = cache.acquire("same.pdf");
  await expect(recovered.promise).resolves.toBe("ready");
  expect(create).toHaveBeenCalledTimes(2);
  expect(destroy).toHaveBeenCalledOnce();
  recovered.release();
  cache.clearIdle();
});

it("retry cancels a released pending task without waiting for idle expiry", () => {
  const tasks = Array.from({ length: 2 }, () => ({
    promise: new Promise<string>(() => {}),
    destroy: vi.fn(async () => {}),
  }));
  const create = vi
    .fn()
    .mockReturnValueOnce(tasks[0])
    .mockReturnValueOnce(tasks[1]);
  const cache = createPdfDocumentCache<string>(create);
  const held = cache.acquire("slow.pdf");
  cache.invalidate("slow.pdf");
  expect(tasks[0]!.destroy).not.toHaveBeenCalled();
  held.release();
  expect(tasks[0]!.destroy).toHaveBeenCalledOnce();
  const retry = cache.acquire("slow.pdf");
  expect(retry.promise).not.toBe(held.promise);
  expect(create).toHaveBeenCalledTimes(2);
  retry.release();
  cache.clearIdle();
});

it("retry preserves a shared chord lease and leaves unrelated cached documents intact", () => {
  const { cache, tasks, create } = setup();
  const reader = cache.acquire("master.pdf");
  const chords = cache.acquire("master.pdf");
  cache.acquire("other.pdf").release();
  cache.invalidate("master.pdf");
  reader.release();
  expect(tasks[0]!.destroy).not.toHaveBeenCalled();
  const retry = cache.acquire("master.pdf");
  expect(create).toHaveBeenCalledTimes(3);
  expect(tasks[1]!.destroy).not.toHaveBeenCalled();
  chords.release();
  expect(tasks[0]!.destroy).toHaveBeenCalledOnce();
  retry.release();
  cache.clearIdle();
});

it("replays current byte progress when a reader joins an existing download", () => {
  const { cache, tasks } = setup();
  const preload = cache.acquire("preloaded.pdf");
  tasks[0]!.onProgress?.({ loaded: 700, total: 1000 });
  const listener = vi.fn();
  const viewer = cache.acquire("preloaded.pdf", undefined, listener);
  expect(listener).toHaveBeenCalledWith({ loaded: 700, total: 1000 });
  viewer.release();
  preload.release();
  cache.clearIdle();
});
