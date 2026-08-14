import type {
  AtomicBlobStore,
  KeyValueStore,
  PlatformServices,
} from "@gys/contracts";

class MemoryKeyValueStore implements KeyValueStore {
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
      capability === "audio" || capability === "deepLinks",
    keyValue,
    blobs,
    speech: [],
    openExternal: async () => undefined,
    now: () => Date.now(),
  };
}
