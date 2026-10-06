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
