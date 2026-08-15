import type {
  AtomicBlobStore,
  KeyValueStore,
  PlatformServices,
  SpeechProvider,
  SpeechVoice,
} from "@gys/contracts";
import { EdgeSpeechProvider, isEdgeSpeechConfigured } from "./edge-speech.js";

class BrowserKeyValueStore implements KeyValueStore {
  public async get<T>(key: string): Promise<T | undefined> {
    const raw = localStorage.getItem(key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }
  public async set<T>(key: string, value: T): Promise<void> {
    localStorage.setItem(key, JSON.stringify(value));
  }
  public async remove(key: string): Promise<void> {
    localStorage.removeItem(key);
  }
}

class BrowserBlobStore implements AtomicBlobStore {
  private readonly fallback = new Map<string, Uint8Array>();

  public async get(key: string): Promise<Uint8Array | undefined> {
    if ("caches" in globalThis) {
      try {
        const response = await caches
          .open("gysapp-blobs")
          .then((cache) =>
            cache.match(
              new Request(`/__gysapp_blob__/${encodeURIComponent(key)}`),
            ),
          );
        if (response) return new Uint8Array(await response.arrayBuffer());
      } catch {
        // Cache Storage is unavailable in some Tauri/webview contexts.
      }
    }
    return this.fallback.get(key)?.slice();
  }

  public async putAtomic(key: string, bytes: Uint8Array): Promise<void> {
    const copy = bytes.slice();
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

export function createBrowserPlatformServices(): PlatformServices {
  const speech = new BrowserSpeechProvider();
  const edgeSpeech = new EdgeSpeechProvider();
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
    speech: [edgeSpeech, speech],
    openExternal: async (url) => {
      const parsed = new URL(url, window.location.href);
      if (!["http:", "https:"].includes(parsed.protocol))
        throw new Error("External URL is not allowed");
      window.open(parsed.href, "_blank", "noopener,noreferrer");
    },
    now: () => Date.now(),
  };
}
