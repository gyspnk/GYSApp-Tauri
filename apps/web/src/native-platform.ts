import type {
  AtomicBlobStore,
  PlatformDeepLinks,
  PlatformDatabase,
  PlatformFile,
  PlatformFileDialogs,
  PlatformLifecycle,
  PlatformLifecycleEvent,
  PlatformNotifications,
  PlatformServices,
  SecretStore,
  SpeechProvider,
} from "@gys/contracts";
import { BrowserLifecycle, BrowserShare } from "./platform-capabilities.js";

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

class TauriSecretStore implements SecretStore {
  public readonly persistent = true;

  public constructor(private readonly invoke: TauriInvoke) {}

  public async get(key: string): Promise<string | undefined> {
    const value = await this.invoke("secret_get", { key });
    if (value === null || value === undefined) return undefined;
    if (typeof value !== "string")
      throw nativeError("native secure storage returned an invalid value");
    return value;
  }

  public async set(key: string, value: string): Promise<void> {
    await this.invoke("secret_set", { key, value });
  }

  public async remove(key: string): Promise<void> {
    await this.invoke("secret_remove", { key });
  }
}

type NativeFilePayload = {
  name: string;
  mimeType: string;
  bytes: string;
};

class TauriFileDialogs implements PlatformFileDialogs {
  public constructor(private readonly invoke: TauriInvoke) {}

  public async open(
    options: {
      accept?: readonly string[];
      multiple?: boolean;
      signal?: AbortSignal;
    } = {},
  ): Promise<PlatformFile[] | undefined> {
    if (options.signal?.aborted)
      throw new DOMException("File dialog cancelled", "AbortError");
    const payload = await this.invoke("file_dialog_open", {
      accept: options.accept,
      multiple: options.multiple,
    });
    if (payload === null || payload === undefined) return undefined;
    if (!Array.isArray(payload))
      throw nativeError("file dialog response invalid");
    const files: PlatformFile[] = [];
    for (const item of payload) {
      if (!item || typeof item !== "object")
        throw nativeError("file dialog item invalid");
      const file = item as Partial<NativeFilePayload>;
      if (
        typeof file.name !== "string" ||
        typeof file.mimeType !== "string" ||
        typeof file.bytes !== "string"
      )
        throw nativeError("file dialog item invalid");
      files.push({
        name: file.name,
        mimeType: file.mimeType,
        bytes: decodeBase64(file.bytes),
      });
    }
    return files;
  }

  public async save(file: PlatformFile): Promise<void> {
    await this.invoke("file_dialog_save", {
      name: file.name,
      mimeType: file.mimeType,
      bytes: encodeBase64(file.bytes),
    });
  }
}

type TauriUnlisten = () => void;

async function listenTauriEvent<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<TauriUnlisten> {
  const module = await import("@tauri-apps/api/event");
  const unlisten = await module.listen<T>(event, (message) =>
    handler(message.payload),
  );
  return unlisten;
}

class TauriDeepLinks implements PlatformDeepLinks {
  private latest: string | undefined;

  public constructor(private readonly invoke: TauriInvoke) {
    void this.invoke("deep_link_current")
      .then((value) => {
        if (Array.isArray(value) && typeof value[0] === "string")
          this.latest = value[0];
      })
      .catch(() => undefined);
  }

  public current(): string | undefined {
    return (
      this.latest ??
      (typeof window === "undefined" ? undefined : window.location.href)
    );
  }

  public subscribe(listener: (url: string) => void): () => void {
    let active = true;
    let unlisten: TauriUnlisten | undefined;
    void listenTauriEvent<string[]>("deep-link://new-url", (urls) => {
      if (!active) return;
      for (const url of urls) {
        if (typeof url !== "string") continue;
        this.latest = url;
        listener(url);
      }
    })
      .then((cleanup) => {
        if (!active) cleanup();
        else unlisten = cleanup;
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }
}

class TauriLifecycle implements PlatformLifecycle {
  private readonly fallback = new BrowserLifecycle();

  public subscribe(
    event: PlatformLifecycleEvent,
    listener: () => void,
  ): () => void {
    const eventName =
      event === "foreground"
        ? "tauri://focus"
        : event === "background"
          ? "tauri://blur"
          : "tauri://close-requested";
    let active = true;
    let unlisten: TauriUnlisten | undefined;
    // Tauri emits focus/blur while the webview can emit visibility/pageshow
    // for the same transition. Coalesce the two platform paths so a resume
    // refresh (and its network work) happens once per lifecycle transition.
    let lastDispatchAt = 0;
    const emit = () => {
      if (!active) return;
      const now = Date.now();
      if (now - lastDispatchAt < 250) return;
      lastDispatchAt = now;
      listener();
    };
    void listenTauriEvent<unknown>(eventName, () => {
      emit();
    })
      .then((cleanup) => {
        if (!active) cleanup();
        else unlisten = cleanup;
      })
      .catch(() => undefined);
    const fallbackCleanup = this.fallback.subscribe(event, emit);
    return () => {
      active = false;
      fallbackCleanup();
      if (unlisten) unlisten();
    };
  }
}

class TauriNotifications implements PlatformNotifications {
  public async permission(): Promise<NotificationPermission | "unsupported"> {
    try {
      const module = await import("@tauri-apps/plugin-notification");
      if (await module.isPermissionGranted()) return "granted";
      const permission = await module.requestPermission();
      return permission === "granted" ? "granted" : permission;
    } catch {
      return "unsupported";
    }
  }

  public async show(title: string, options?: { body?: string; tag?: string }) {
    const module = await import("@tauri-apps/plugin-notification");
    const permission = await this.permission();
    if (permission !== "granted")
      throw nativeError("notification permission was not granted");
    await module.sendNotification({
      title,
      ...(options?.body ? { body: options.body } : {}),
      ...(options?.tag ? { group: options.tag } : {}),
    });
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
  const notifications = new TauriNotifications();
  return {
    hasCapability(capability) {
      if (capability === "speech") return speech.length > 0;
      if (capability === "audio") return true;
      if (capability === "database") return true;
      if (capability === "secureStorage") return true;
      if (capability === "share")
        return typeof navigator !== "undefined" && "share" in navigator;
      if (capability === "notifications") return true;
      if (capability === "mediaSession")
        return typeof navigator !== "undefined" && "mediaSession" in navigator;
      if (capability === "wakeLock")
        return typeof navigator !== "undefined" && "wakeLock" in navigator;
      if (capability === "lifecycle") return true;
      if (capability === "fileDialog") return true;
      if (capability === "deepLinks") return true;
      return false;
    },
    keyValue,
    database,
    blobs: new TauriBlobStore(invoke),
    secrets: new TauriSecretStore(invoke),
    notifications,
    files: new TauriFileDialogs(invoke),
    share: new BrowserShare(),
    speech,
    deepLinks: new TauriDeepLinks(invoke),
    lifecycle: new TauriLifecycle(),
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
