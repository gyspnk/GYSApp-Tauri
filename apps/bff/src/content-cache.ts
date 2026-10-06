type Entry<T> = {
  value: T;
  freshUntil: number;
  staleUntil: number;
  retryAt: number;
};

/** Public publisher content only. Keep warm responses immediate and share refreshes. */
export class ContentCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly pending = new Map<string, Promise<T>>();

  public constructor(
    private readonly freshMs: number,
    private readonly staleMs = 60 * 60_000,
    private readonly limit = 32,
    private readonly now = Date.now,
  ) {}

  public async get(
    key: string,
    load: () => Promise<T>,
    defer?: (task: Promise<unknown>) => void,
  ): Promise<T> {
    const entry = this.entries.get(key);
    if (entry) {
      this.entries.delete(key);
      this.entries.set(key, entry);
      if (this.now() < entry.freshUntil) return entry.value;
      if (this.now() < entry.staleUntil) {
        if (this.now() >= entry.retryAt && this.pending.size < this.limit) {
          const task = this.refresh(key, load).catch(() => undefined);
          defer?.(task);
        }
        return entry.value;
      }
    }
    return this.refresh(key, load);
  }

  private refresh(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) return existing;
    if (this.pending.size >= this.limit)
      return Promise.reject(new Error("Content source is busy"));
    const task = Promise.resolve()
      .then(load)
      .then((value) => {
        const now = this.now();
        this.entries.delete(key);
        this.entries.set(key, {
          value,
          freshUntil: now + this.freshMs,
          staleUntil: now + this.freshMs + this.staleMs,
          retryAt: 0,
        });
        while (this.entries.size > this.limit)
          this.entries.delete(this.entries.keys().next().value!);
        return value;
      })
      .catch((error: unknown) => {
        const entry = this.entries.get(key);
        if (entry) entry.retryAt = this.now() + 30_000;
        throw error;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, task);
    return task;
  }
}

/** Stable across refresh timestamps; any actual payload edit changes the validator. */
export async function contentEtag(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return `W/"${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}"`;
}
