import type {
  AtomicBlobStore,
  KeyValueStore,
  PlatformServices,
  SpeechProvider,
  SpeechVoice,
} from "@gys/contracts";
import { EdgeSpeechProvider, isEdgeSpeechConfigured } from "./edge-speech.js";
import {
  createTauriPlatformServices,
  getTauriInvoke,
} from "./native-platform.js";

const PLATFORM_DB = "gysapp-platform-v1";
const PLATFORM_STORE = "key-value";
const PLATFORM_BLOB_STORE = "blobs";
const PLATFORM_DB_VERSION = 2;

let platformDbPromise: Promise<IDBDatabase | undefined> | undefined;

function openPlatformDatabase(): Promise<IDBDatabase | undefined> {
  if (platformDbPromise) return platformDbPromise;
  if (typeof indexedDB === "undefined") {
    platformDbPromise = Promise.resolve(undefined);
    return platformDbPromise;
  }
  platformDbPromise = new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(PLATFORM_DB, PLATFORM_DB_VERSION);
    } catch {
      resolve(undefined);
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PLATFORM_STORE))
        request.result.createObjectStore(PLATFORM_STORE);
      if (!request.result.objectStoreNames.contains(PLATFORM_BLOB_STORE))
        request.result.createObjectStore(PLATFORM_BLOB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
    request.onblocked = () => resolve(undefined);
  });
  return platformDbPromise;
}

class BrowserKeyValueStore implements KeyValueStore {
  private openDatabase(): Promise<IDBDatabase | undefined> {
    return openPlatformDatabase();
  }

  private async run<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.openDatabase();
    if (!db) throw new Error("IndexedDB is unavailable");
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      let result!: T;
      let transaction: IDBTransaction;
      try {
        transaction = db.transaction(PLATFORM_STORE, mode);
        const request = action(transaction.objectStore(PLATFORM_STORE));
        request.onsuccess = () => {
          result = request.result;
        };
        request.onerror = () => {
          if (settled) return;
          settled = true;
          reject(request.error ?? new Error("IndexedDB request failed"));
        };
        transaction.oncomplete = () => {
          if (settled) return;
          settled = true;
          resolve(result);
        };
        transaction.onerror = () => {
          if (settled) return;
          settled = true;
          reject(
            transaction.error ?? new Error("IndexedDB transaction failed"),
          );
        };
        transaction.onabort = () => {
          if (settled) return;
          settled = true;
          reject(new Error("IndexedDB transaction aborted"));
        };
      } catch (error) {
        if (!settled) {
          settled = true;
          reject(error);
        }
      }
    });
  }

  private fallbackGet<T>(key: string): T | undefined {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    } catch {
      return undefined;
    }
  }

  private fallbackSet<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage quota/private mode must not crash the reader.
    }
  }

  public async get<T>(key: string): Promise<T | undefined> {
    try {
      const encoded = await this.run<string | undefined>("readonly", (store) =>
        store.get(key),
      );
      if (encoded === undefined) {
        const legacy = this.fallbackGet<T>(key);
        if (legacy !== undefined) void this.set(key, legacy);
        return legacy;
      }
      return JSON.parse(encoded) as T;
    } catch {
      return this.fallbackGet<T>(key);
    }
  }
  public async set<T>(key: string, value: T): Promise<void> {
    const encoded = JSON.stringify(value);
    try {
      await this.run("readwrite", (store) => store.put(encoded, key));
    } catch {
      this.fallbackSet(key, value);
    }
  }
  public async remove(key: string): Promise<void> {
    try {
      await this.run("readwrite", (store) => store.delete(key));
    } catch {
      try {
        localStorage.removeItem(key);
      } catch {
        // Storage is optional in private/embedded contexts.
      }
    }
  }
}

class BrowserBlobStore implements AtomicBlobStore {
  private readonly fallback = new Map<string, Uint8Array>();

  private async run<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await openPlatformDatabase();
    if (!db) throw new Error("IndexedDB is unavailable");
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      let result!: T;
      let transaction: IDBTransaction;
      try {
        transaction = db.transaction(PLATFORM_BLOB_STORE, mode);
        const request = action(transaction.objectStore(PLATFORM_BLOB_STORE));
        request.onsuccess = () => {
          result = request.result;
        };
        request.onerror = () => {
          if (settled) return;
          settled = true;
          reject(request.error ?? new Error("IndexedDB blob request failed"));
        };
        transaction.oncomplete = () => {
          if (settled) return;
          settled = true;
          resolve(result);
        };
        transaction.onerror = () => {
          if (settled) return;
          settled = true;
          reject(
            transaction.error ?? new Error("IndexedDB blob transaction failed"),
          );
        };
        transaction.onabort = () => {
          if (settled) return;
          settled = true;
          reject(new Error("IndexedDB blob transaction aborted"));
        };
      } catch (error) {
        if (!settled) {
          settled = true;
          reject(error);
        }
      }
    });
  }

  private async persistentGet(key: string): Promise<Uint8Array | undefined> {
    const value = await this.run<Uint8Array | ArrayBuffer | undefined>(
      "readonly",
      (store) => store.get(key),
    );
    if (value instanceof Uint8Array) return value.slice();
    if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
    return undefined;
  }

  public async get(key: string): Promise<Uint8Array | undefined> {
    try {
      const persistent = await this.persistentGet(key);
      if (persistent) return persistent;
    } catch {
      // IndexedDB is optional in private mode and restricted webviews.
    }
    if ("caches" in globalThis) {
      try {
        const response = await caches
          .open("gysapp-blobs")
          .then((cache) =>
            cache.match(
              new Request(`/__gysapp_blob__/${encodeURIComponent(key)}`),
            ),
          );
        if (response) {
          const bytes = new Uint8Array(await response.arrayBuffer());
          // Cache Storage is a useful HTTP-facing layer; backfill the durable
          // store so a later Cache Storage eviction does not lose the blob.
          try {
            await this.run("readwrite", (store) => store.put(bytes, key));
          } catch {
            // The in-memory fallback below still makes this request usable.
          }
          return bytes;
        }
      } catch {
        // Cache Storage is unavailable in some Tauri/webview contexts.
      }
    }
    return this.fallback.get(key)?.slice();
  }

  public async putAtomic(key: string, bytes: Uint8Array): Promise<void> {
    const copy = bytes.slice();
    try {
      // IndexedDB transactions commit the pointer/value atomically and survive
      // reloads even when Cache Storage is disabled by an embedded webview.
      await this.run("readwrite", (store) => store.put(copy, key));
    } catch {
      // Continue with Cache Storage and the in-memory compatibility fallback.
    }
    if ("caches" in globalThis) {
      try {
        const cache = await caches.open("gysapp-blobs");
        await cache.put(
          new Request(`/__gysapp_blob__/${encodeURIComponent(key)}`),
          new Response(copy),
        );
      } catch {
        // The in-memory copy below remains available for this session.
      }
    }
    this.fallback.set(key, copy);
  }

  public async remove(key: string): Promise<void> {
    this.fallback.delete(key);
    try {
      await this.run("readwrite", (store) => store.delete(key));
    } catch {
      // IndexedDB is optional; Cache Storage cleanup below remains best effort.
    }
    if ("caches" in globalThis) {
      try {
        await caches
          .open("gysapp-blobs")
          .then((cache) =>
            cache.delete(
              new Request(`/__gysapp_blob__/${encodeURIComponent(key)}`),
            ),
          );
      } catch {
        // Cache Storage is optional; the in-memory adapter is already cleared.
      }
    }
  }
}

export class BrowserSpeechProvider implements SpeechProvider {
  public readonly id = "browser-system";
  private active: SpeechSynthesisUtterance | undefined;
  private activeCancel: ((error: Error) => void) | undefined;

  public async status(): Promise<{
    available: boolean;
    offline: boolean;
    reason?: string;
  }> {
    if (typeof window === "undefined" || !("speechSynthesis" in window))
      return {
        available: false,
        offline: false,
        reason: "Speech synthesis is unavailable",
      };
    const voices = await this.voices();
    return {
      available: voices.length > 0,
      offline: voices.some((voice) => voice.local),
    };
  }

  public async voices(): Promise<SpeechVoice[]> {
    if (!("speechSynthesis" in window)) return [];
    const read = (): SpeechVoice[] =>
      window.speechSynthesis.getVoices().map((voice) => ({
        id: voice.voiceURI,
        name: voice.name,
        language: voice.lang,
        local: voice.localService,
      }));
    const current = read();
    if (current.length > 0) return current;
    return new Promise((resolve) => {
      let settled = false;
      let timer: number | undefined;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) window.clearTimeout(timer);
        window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
        resolve(read());
      };
      const onVoices = () => {
        finish();
      };
      window.speechSynthesis.addEventListener("voiceschanged", onVoices, {
        once: true,
      });
      timer = window.setTimeout(finish, 800);
    });
  }

  public async speak(
    text: string,
    options: {
      voiceId?: string;
      rate?: number;
      pitch?: number;
      volume?: number;
    },
    signal?: AbortSignal,
  ): Promise<void> {
    if (typeof window === "undefined" || !(await this.status()).available)
      throw new Error("No browser voice is available");
    await this.stop();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options.rate ?? 1;
    utterance.pitch = options.pitch ?? 1;
    utterance.volume = options.volume ?? 1;
    const voice = (await this.voices()).find(
      (candidate) => candidate.id === options.voiceId,
    );
    if (voice)
      utterance.voice =
        window.speechSynthesis
          .getVoices()
          .find((candidate) => candidate.voiceURI === voice.id) ?? null;
    this.active = utterance;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        signal?.removeEventListener("abort", abort);
        if (this.activeCancel === cancel) this.activeCancel = undefined;
        if (this.active === utterance) this.active = undefined;
      };
      const cancel = (error: Error) => {
        if (settled) return;
        settled = true;
        window.speechSynthesis.cancel();
        cleanup();
        reject(error);
      };
      const abort = () =>
        cancel(new DOMException("Speech cancelled", "AbortError"));
      this.activeCancel = cancel;
      signal?.addEventListener("abort", abort, { once: true });
      utterance.onend = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      utterance.onerror = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("Browser speech failed"));
      };
      window.speechSynthesis.speak(utterance);
    });
  }

  public async pause(): Promise<void> {
    window.speechSynthesis.pause();
  }
  public async resume(): Promise<void> {
    window.speechSynthesis.resume();
  }
  public async stop(): Promise<void> {
    this.activeCancel?.(new DOMException("Speech cancelled", "AbortError"));
    window.speechSynthesis.cancel();
    this.active = undefined;
    this.activeCancel = undefined;
  }
}

function createSpeechProviders(): SpeechProvider[] {
  const speech = new BrowserSpeechProvider();
  const edgeSpeech = new EdgeSpeechProvider();
  return [edgeSpeech, speech];
}

export function createBrowserPlatformServices(): PlatformServices {
  const speech = createSpeechProviders();
  return {
    hasCapability(capability) {
      if (capability === "speech")
        return "speechSynthesis" in window || isEdgeSpeechConfigured();
      if (capability === "share") return "share" in navigator;
      if (capability === "notifications") return "Notification" in window;
      if (capability === "wakeLock") return "wakeLock" in navigator;
      if (capability === "mediaSession") return "mediaSession" in navigator;
      return true;
    },
    keyValue: new BrowserKeyValueStore(),
    blobs: new BrowserBlobStore(),
    speech,
    openExternal: async (url) => {
      const parsed = new URL(url, window.location.href);
      if (!["http:", "https:"].includes(parsed.protocol))
        throw new Error("External URL is not allowed");
      window.open(parsed.href, "_blank", "noopener,noreferrer");
    },
    now: () => Date.now(),
  };
}

/**
 * Select the native app-data adapter when the page is running inside a Tauri
 * webview. Browser/PWA builds keep the Indexed browser capability adapter.
 */
export function createPlatformServices(): PlatformServices {
  const invoke = getTauriInvoke();
  return invoke
    ? createTauriPlatformServices(invoke, createSpeechProviders())
    : createBrowserPlatformServices();
}
