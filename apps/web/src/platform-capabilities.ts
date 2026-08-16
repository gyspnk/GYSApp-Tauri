import type {
  PlatformDeepLinks,
  PlatformFile,
  PlatformFileDialogs,
  PlatformLifecycle,
  PlatformLifecycleEvent,
  PlatformNotifications,
  PlatformNotificationOptions,
  PlatformShare,
  SecretStore,
} from "@gys/contracts";

/**
 * Browser memory is deliberately not advertised as secure/persistent
 * storage. It is only a short-lived boundary for flows that need a secret
 * interface while authentication remains in HttpOnly cookies.
 */
export class EphemeralSecretStore implements SecretStore {
  public readonly persistent = false;
  private readonly values = new Map<string, string>();

  public async get(key: string): Promise<string | undefined> {
    return this.values.get(key);
  }

  public async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  public async remove(key: string): Promise<void> {
    this.values.delete(key);
  }
}

export class BrowserNotifications implements PlatformNotifications {
  public async permission(): Promise<NotificationPermission | "unsupported"> {
    if (typeof Notification === "undefined") return "unsupported";
    return Notification.permission === "default"
      ? Notification.requestPermission()
      : Notification.permission;
  }

  public async show(
    title: string,
    options?: PlatformNotificationOptions,
  ): Promise<void> {
    if (typeof Notification === "undefined")
      throw new Error("Notifications are unavailable");
    const permission = await this.permission();
    if (permission !== "granted")
      throw new Error("Notification permission was not granted");
    new Notification(title, options);
  }
}

function fileFromNative(file: File): Promise<PlatformFile> {
  return file.arrayBuffer().then((bytes) => ({
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    bytes: new Uint8Array(bytes),
  }));
}

export class BrowserFileDialogs implements PlatformFileDialogs {
  public open(
    options: {
      accept?: readonly string[];
      multiple?: boolean;
      signal?: AbortSignal;
    } = {},
  ): Promise<PlatformFile[] | undefined> {
    if (typeof document === "undefined")
      return Promise.reject(new Error("File dialogs are unavailable"));
    if (options.signal?.aborted)
      return Promise.reject(
        new DOMException("File dialog cancelled", "AbortError"),
      );

    return new Promise<PlatformFile[] | undefined>((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = options.multiple ?? false;
      if (options.accept?.length) input.accept = options.accept.join(",");
      let settled = false;
      const timer = window.setTimeout(() => finish(undefined), 60_000);
      const cleanup = () => {
        window.clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
        input.remove();
      };
      const finish = (value: PlatformFile[] | undefined, error?: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve(value);
      };
      const abort = () =>
        finish(
          undefined,
          new DOMException("File dialog cancelled", "AbortError"),
        );
      input.onchange = () => {
        const files = input.files ? [...input.files] : [];
        void Promise.all(files.map(fileFromNative)).then(
          (value) => finish(value),
          (error: unknown) => finish(undefined, error),
        );
      };
      input.oncancel = () => finish(undefined);
      options.signal?.addEventListener("abort", abort, { once: true });
      input.style.display = "none";
      document.body.append(input);
      input.click();
    });
  }

  public async save(file: PlatformFile): Promise<void> {
    if (typeof document === "undefined")
      throw new Error("File dialogs are unavailable");
    const buffer = new ArrayBuffer(file.bytes.byteLength);
    new Uint8Array(buffer).set(file.bytes);
    const url = URL.createObjectURL(
      new Blob([buffer], {
        type: file.mimeType || "application/octet-stream",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}

export class BrowserShare implements PlatformShare {
  public async share(data: {
    title?: string;
    text?: string;
    url?: string;
  }): Promise<void> {
    if (!("share" in navigator)) throw new Error("Sharing is unavailable");
    await navigator.share(data);
  }
}

export class BrowserDeepLinks implements PlatformDeepLinks {
  public current(): string | undefined {
    return typeof window === "undefined" ? undefined : window.location.href;
  }

  public subscribe(listener: (url: string) => void): () => void {
    if (typeof window === "undefined") return () => undefined;
    const onChange = () => listener(window.location.href);
    window.addEventListener("popstate", onChange);
    window.addEventListener("hashchange", onChange);
    return () => {
      window.removeEventListener("popstate", onChange);
      window.removeEventListener("hashchange", onChange);
    };
  }
}

export class BrowserLifecycle implements PlatformLifecycle {
  public subscribe(
    event: PlatformLifecycleEvent,
    listener: () => void,
  ): () => void {
    if (typeof window === "undefined" || typeof document === "undefined")
      return () => undefined;
    if (event === "foreground") {
      const onForeground = () => {
        if (document.visibilityState === "visible") listener();
      };
      document.addEventListener("visibilitychange", onForeground);
      window.addEventListener("pageshow", onForeground);
      return () => {
        document.removeEventListener("visibilitychange", onForeground);
        window.removeEventListener("pageshow", onForeground);
      };
    }
    if (event === "background") {
      const onBackground = () => {
        if (document.visibilityState === "hidden") listener();
      };
      document.addEventListener("visibilitychange", onBackground);
      window.addEventListener("pagehide", onBackground);
      return () => {
        document.removeEventListener("visibilitychange", onBackground);
        window.removeEventListener("pagehide", onBackground);
      };
    }
    const onExit = () => listener();
    window.addEventListener("beforeunload", onExit);
    return () => window.removeEventListener("beforeunload", onExit);
  }
}
