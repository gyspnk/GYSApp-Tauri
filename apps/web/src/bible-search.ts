import {
  BibleRepository,
  type BibleSearchOptions,
  type BibleVerse,
} from "@gys/domain";

type WorkerRequest =
  | { type: "init"; verses: BibleVerse[] }
  | {
      type: "search";
      id: number;
      query: string;
      options: BibleSearchOptions;
    }
  | { type: "cancel"; id: number };

type WorkerResponse =
  | { type: "ready" }
  | { type: "result"; id: number; verses: BibleVerse[] }
  | { type: "error"; id: number; message: string };

export type BibleSearchWorker = {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: (message: WorkerRequest) => void;
  terminate: () => void;
};

export type BibleSearchWorkerFactory = () => BibleSearchWorker;

type PendingSearch = {
  query: string;
  options: BibleSearchOptions;
  resolve: (verses: BibleVerse[]) => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};

function abortError(): DOMException {
  return new DOMException("Pencarian dibatalkan.", "AbortError");
}

function createDefaultWorker(): BibleSearchWorker {
  return new Worker(new URL("./bible-search-worker.ts", import.meta.url), {
    type: "module",
  });
}

/**
 * Keeps the 31k-verse search index off the React/main-thread path. The
 * repository fallback is intentionally retained for SSR, older browsers, and
 * worker startup failures so search never becomes a hard dependency.
 */
export class BibleSearchClient {
  private readonly fallback: BibleRepository;
  private readonly pending = new Map<number, PendingSearch>();
  private readonly ready: Promise<void>;
  private resolveReady!: () => void;
  private worker: BibleSearchWorker | undefined;
  private nextId = 0;
  private failed = false;
  private readyTimer: ReturnType<typeof setTimeout> | undefined;

  public constructor(
    verses: readonly BibleVerse[],
    workerFactory: BibleSearchWorkerFactory = createDefaultWorker,
  ) {
    this.fallback = new BibleRepository(verses);
    this.ready = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });

    if (
      typeof Worker === "undefined" &&
      workerFactory === createDefaultWorker
    ) {
      this.failed = true;
      this.resolveReady();
      return;
    }
    try {
      this.worker = workerFactory();
      this.worker.onmessage = (event) => this.handleMessage(event.data);
      this.worker.onerror = () => this.failWorker();
      this.worker.postMessage({ type: "init", verses: [...verses] });
      this.readyTimer = setTimeout(() => this.failWorker(), 4_000);
    } catch {
      this.failWorker();
    }
  }

  public get backend(): "worker" | "main" {
    return this.worker && !this.failed ? "worker" : "main";
  }

  public async search(
    query: string,
    options: BibleSearchOptions = {},
    signal?: AbortSignal,
  ): Promise<BibleVerse[]> {
    if (signal?.aborted) throw abortError();
    if (!this.worker || this.failed) {
      return this.fallback.search(query, options);
    }
    await this.ready;
    if (signal?.aborted) throw abortError();
    if (!this.worker || this.failed) {
      return this.fallback.search(query, options);
    }

    const id = ++this.nextId;
    return new Promise<BibleVerse[]>((resolve, reject) => {
      const onAbort = () => {
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        this.worker?.postMessage({ type: "cancel", id });
        reject(abortError());
      };
      this.pending.set(id, {
        query,
        options,
        resolve,
        reject,
        ...(signal ? { signal, onAbort } : {}),
      });
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        this.worker?.postMessage({ type: "search", id, query, options });
      } catch {
        this.pending.delete(id);
        signal?.removeEventListener("abort", onAbort);
        void this.fallback.search(query, options).then(resolve, reject);
      }
    });
  }

  public dispose(): void {
    this.failed = true;
    this.resolveReady();
    if (this.readyTimer !== undefined) clearTimeout(this.readyTimer);
    this.readyTimer = undefined;
    this.worker?.terminate();
    this.worker = undefined;
    for (const [id, pending] of this.pending) {
      pending.signal?.removeEventListener(
        "abort",
        pending.onAbort ?? (() => undefined),
      );
      pending.reject(abortError());
      this.pending.delete(id);
    }
  }

  private handleMessage(message: WorkerResponse): void {
    if (message.type === "ready") {
      if (this.readyTimer !== undefined) clearTimeout(this.readyTimer);
      this.readyTimer = undefined;
      this.resolveReady();
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (pending.signal && pending.onAbort)
      pending.signal.removeEventListener("abort", pending.onAbort);
    if (message.type === "result") pending.resolve(message.verses);
    else pending.reject(new Error(message.message));
  }

  private failWorker(): void {
    if (this.failed) return;
    this.failed = true;
    if (this.readyTimer !== undefined) clearTimeout(this.readyTimer);
    this.readyTimer = undefined;
    this.worker?.terminate();
    this.worker = undefined;
    this.resolveReady();
    const pending = [...this.pending.entries()];
    this.pending.clear();
    for (const [, request] of pending) {
      request.signal?.removeEventListener(
        "abort",
        request.onAbort ?? (() => undefined),
      );
      void this.fallback
        .search(request.query, request.options)
        .then(request.resolve, request.reject);
    }
  }
}
