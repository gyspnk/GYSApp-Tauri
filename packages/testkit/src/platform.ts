import type {
  AtomicBlobStore,
  PlatformDatabase,
  PlatformDeepLinks,
  PlatformFileDialogs,
  PlatformLifecycle,
  PlatformNotifications,
  PlatformShare,
  PlatformServices,
  SecretStore,
} from "@gys/contracts";

class MemoryKeyValueStore implements PlatformDatabase {
  public readonly engine = "memory" as const;
  private readonly values = new Map<string, unknown>();
  public async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }
  public async set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, structuredClone(value));
  }
  public async remove(key: string): Promise<void> {
    this.values.delete(key);
  }
}

class MemorySecretStore implements SecretStore {
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

const unsupportedNotifications: PlatformNotifications = {
  async permission() {
    return "unsupported";
  },
  async show() {
    throw new Error("Notifications are unavailable in the memory fixture");
  },
};
const unsupportedFiles: PlatformFileDialogs = {
  async open() {
    throw new Error("File dialogs are unavailable in the memory fixture");
  },
  async save() {
    throw new Error("File dialogs are unavailable in the memory fixture");
  },
};
const unsupportedShare: PlatformShare = {
  async share() {
    throw new Error("Sharing is unavailable in the memory fixture");
  },
};
const memoryDeepLinks: PlatformDeepLinks = {
  current: () => undefined,
  subscribe: () => () => undefined,
};
const memoryLifecycle: PlatformLifecycle = {
  subscribe: () => () => undefined,
};

class MemoryBlobStore implements AtomicBlobStore {
  private readonly values = new Map<string, Uint8Array>();
  public async get(key: string): Promise<Uint8Array | undefined> {
    const value = this.values.get(key);
    return value ? value.slice() : undefined;
  }
  public async putAtomic(key: string, bytes: Uint8Array): Promise<void> {
    this.values.set(key, bytes.slice());
  }
  public async remove(key: string): Promise<void> {
    this.values.delete(key);
  }
}

export function createMemoryPlatform(): PlatformServices {
  const keyValue = new MemoryKeyValueStore();
  const blobs = new MemoryBlobStore();
  return {
    hasCapability: (capability) =>
      capability === "audio" || capability === "database",
    keyValue,
    database: keyValue,
    blobs,
    secrets: new MemorySecretStore(),
    notifications: unsupportedNotifications,
    files: unsupportedFiles,
    share: unsupportedShare,
    speech: [],
    deepLinks: memoryDeepLinks,
    lifecycle: memoryLifecycle,
    openExternal: async () => undefined,
    now: () => Date.now(),
  };
}
