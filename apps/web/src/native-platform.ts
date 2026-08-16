import type {
  AtomicBlobStore,
  PlatformDatabase,
  PlatformServices,
  SpeechProvider,
} from "@gys/contracts";
import {
  BrowserDeepLinks,
  BrowserLifecycle,
  BrowserNotifications,
  BrowserShare,
  EphemeralSecretStore,
} from "./platform-capabilities.js";

/**
 * Narrow boundary around Tauri's global invoke bridge. Keeping this type local
 * means the web bundle does not need to ship the full Tauri JS client and the
 * same adapter can be exercised with a deterministic contract fixture.
 */
export type TauriInvoke = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

type TauriGlobal = {
  __TAURI_INTERNALS__?: { invoke?: TauriInvoke };
  __TAURI__?: { invoke?: TauriInvoke };
};

export function getTauriInvoke(
  value: typeof globalThis = globalThis,
): TauriInvoke | undefined {
  const candidate = value as typeof globalThis & TauriGlobal;
  return candidate.__TAURI_INTERNALS__?.invoke ?? candidate.__TAURI__?.invoke;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)),
    );
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function nativeError(message: string): Error {
  return new Error(`Native platform: ${message}`);
}

class TauriKeyValueStore implements PlatformDatabase {
  public readonly engine = "native-app-data" as const;

  public constructor(private readonly invoke: TauriInvoke) {}

  public async get<T>(key: string): Promise<T | undefined> {
    const value = await this.invoke("key_value_get", { key });
    if (value === null || value === undefined) return undefined;
    if (typeof value !== "string")
      throw nativeError("key-value response was not text");
    try {
      return JSON.parse(value) as T;
    } catch {
      throw nativeError(`stored value for ${key} is corrupted`);
    }
  }

  public async set<T>(key: string, value: T): Promise<void> {
    const encoded = JSON.stringify(value);
    if (encoded === undefined)
      throw nativeError(`value for ${key} cannot be serialized`);
    await this.invoke("key_value_set", { key, value: encoded });
  }

  public async remove(key: string): Promise<void> {
    await this.invoke("key_value_remove", { key });
  }
}

/**
 * SQLite-backed native database. Preferences intentionally stay on the small
 * key/value file adapter above, while repositories that need a durable query
 * boundary use these commands. Keeping the two stores separate makes the
 * migration path explicit and prevents a future database reset from silently
 * changing preference semantics.
 */
class TauriDatabaseStore implements PlatformDatabase {
  public readonly engine = "native-app-data" as const;

  public constructor(private readonly invoke: TauriInvoke) {}

  public async get<T>(key: string): Promise<T | undefined> {
    const value = await this.invoke("database_get", { key });
    if (value === null || value === undefined) return undefined;
    if (typeof value !== "string")
      throw nativeError("database response was not text");
    try {
      return JSON.parse(value) as T;
    } catch {
      throw nativeError(`database value for ${key} is corrupted`);
    }
  }

  public async set<T>(key: string, value: T): Promise<void> {
    const encoded = JSON.stringify(value);
    if (encoded === undefined)
      throw nativeError(`database value for ${key} cannot be serialized`);
    await this.invoke("database_set", { key, value: encoded });
  }

  public async remove(key: string): Promise<void> {
    await this.invoke("database_remove", { key });
  }
}

class TauriBlobStore implements AtomicBlobStore {
  public constructor(private readonly invoke: TauriInvoke) {}

  public async get(key: string): Promise<Uint8Array | undefined> {
    const value = await this.invoke("blob_get", { key });
    if (value === null || value === undefined) return undefined;
    if (typeof value !== "string")
      throw nativeError("blob response was not base64 text");
    try {
      return decodeBase64(value);
    } catch {
      throw nativeError(`blob ${key} is corrupted`);
    }
  }

  public async putAtomic(key: string, bytes: Uint8Array): Promise<void> {
    await this.invoke("blob_put_atomic", {
      key,
      bytes: encodeBase64(bytes),
    });
  }

  public async remove(key: string): Promise<void> {
    await this.invoke("blob_remove", { key });
  }
}

/**
 * Native adapter used by Tauri webviews. Heavy data never falls back to
 * localStorage/Cache Storage: it is written by Rust below the app-data
 * directory with an atomic rename.
 */
export function createTauriPlatformServices(
  invoke: TauriInvoke,
  speech: SpeechProvider[] = [],
): PlatformServices {
  const keyValue = new TauriKeyValueStore(invoke);
  const database = new TauriDatabaseStore(invoke);
  return {
    hasCapability(capability) {
      if (capability === "speech") return speech.length > 0;
      if (capability === "audio") return true;
      if (capability === "database") return true;
      if (capability === "secureStorage") return false;
      if (capability === "share")
        return typeof navigator !== "undefined" && "share" in navigator;
      if (capability === "notifications")
        return typeof window !== "undefined" && "Notification" in window;
      if (capability === "mediaSession")
        return typeof navigator !== "undefined" && "mediaSession" in navigator;
      if (capability === "wakeLock")
        return typeof navigator !== "undefined" && "wakeLock" in navigator;
      if (capability === "lifecycle") return true;
      // File dialogs and deep links require their platform-specific command
      // adapters; reporting false is safer than claiming a plugin is wired.
      return false;
    },
    keyValue,
    database,
    blobs: new TauriBlobStore(invoke),
    secrets: new EphemeralSecretStore(),
    notifications: new BrowserNotifications(),
    files: {
      open: async () => {
        throw nativeError("file dialogs are not configured");
      },
      save: async () => {
        throw nativeError("file dialogs are not configured");
      },
    },
    share: new BrowserShare(),
    speech,
    deepLinks: new BrowserDeepLinks(),
    lifecycle: new BrowserLifecycle(),
    openExternal: async (url) => {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw nativeError("external URL is invalid");
      }
      if (!parsed.protocol || !["http:", "https:"].includes(parsed.protocol))
        throw nativeError("external URL is not allowed");
      await invoke("open_external", { url: parsed.href });
    },
    now: () => Date.now(),
  };
}
