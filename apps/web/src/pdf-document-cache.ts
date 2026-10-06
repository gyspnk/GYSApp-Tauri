import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import { pdfDocumentSourceOptions } from "./pdf-utils.js";
import { workerSrc } from "./pdf-worker.js";

GlobalWorkerOptions.workerSrc = workerSrc;

type Progress = { loaded: number; total: number };
type Task<T> = {
  promise: Promise<T>;
  destroy: () => Promise<void>;
  onProgress?: ((progress: Progress) => void) | undefined;
};

/** Leases keep active readers alive; at most two idle workers survive for 30s. */
export function createPdfDocumentCache<T>(
  createTask: (src: string, data?: Uint8Array) => Task<T>,
  idleMs = 30_000,
  idleLimit = 2,
) {
  type Entry = {
    task: Task<T>;
    readers: number;
    listeners: Set<(progress: Progress) => void>;
    timer?: ReturnType<typeof setTimeout>;
  };
  const entries = new Map<string, Entry>();
  const byteKeys = new WeakMap<Uint8Array, number>();
  let nextByteKey = 0;
  const destroy = (key: string, entry: Entry) => {
    if (entries.get(key) === entry) entries.delete(key);
    clearTimeout(entry.timer);
    void entry.task.destroy().catch(() => undefined);
  };
  const trim = () => {
    const idle = [...entries].filter(([, entry]) => entry.readers === 0);
    for (const [key, entry] of idle.slice(
      0,
      Math.max(0, idle.length - idleLimit),
    ))
      destroy(key, entry);
  };
  return {
    acquire(
      src: string,
      data?: Uint8Array,
      onProgress?: (progress: Progress) => void,
    ) {
      if (data && !byteKeys.has(data)) byteKeys.set(data, ++nextByteKey);
      const key = data ? `bytes:${byteKeys.get(data)}` : src;
      let entry = entries.get(key);
      if (!entry) {
        const task = createTask(src, data);
        entry = { task, readers: 0, listeners: new Set() };
        const current = entry;
        task.onProgress = (progress) =>
          current.listeners.forEach((listener) => listener(progress));
        entries.set(key, entry);
        void task.promise.catch(() => destroy(key, current));
      }
      const current = entry;
      clearTimeout(current.timer);
      current.readers++;
      if (onProgress) current.listeners.add(onProgress);
      let released = false;
      return {
        promise: current.task.promise,
        release() {
          if (released) return;
          released = true;
          if (onProgress) current.listeners.delete(onProgress);
          current.readers--;
          if (current.readers === 0 && entries.get(key) === current) {
            // Move the released document to the end of the LRU.
            entries.delete(key);
            entries.set(key, current);
            current.timer = setTimeout(() => destroy(key, current), idleMs);
            trim();
          }
        },
      };
    },
    clearIdle() {
      for (const [key, entry] of entries)
        if (entry.readers === 0) destroy(key, entry);
    },
  };
}

export const pdfDocuments = createPdfDocumentCache<PDFDocumentProxy>(
  (src, data) => {
    const task = getDocument(pdfDocumentSourceOptions(src, data));
    return {
      promise: task.promise,
      destroy: () => task.destroy(),
      set onProgress(callback: ((progress: Progress) => void) | undefined) {
        task.onProgress = callback ?? (() => {});
      },
    };
  },
);
