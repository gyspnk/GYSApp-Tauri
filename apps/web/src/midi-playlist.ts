import { MidiPlaylistController } from "@gys/domain";
import type {
  AutoNextMode,
  MidiPlaylist,
  MidiPlaylistItem,
} from "@gys/contracts";

const STORAGE_KEY = "gys-midi-playlist-v1";
const EVENT_NAME = "gys-midi-playlist-change";
const IDB_DB = "gys-playlist-backup";
const IDB_STORE = "kv";
const IDB_KEY = "playlists";

// The controller owns playlist invariants (deduplication, reorder, loop and
// shuffle). This adapter adds a durable browser boundary so a queue survives
// route changes, tab reloads, and encrypted backup/export without coupling the
// domain package to localStorage.
const controller = new MidiPlaylistController();
let hydrated = false;
let stableSnapshot: MidiPlaylist = controller.snapshot();

function openBackupDb(mode: "readonly" | "readwrite"): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(IDB_STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(IDB_STORE)) {
        resolve(db);
      } else {
        // Self-heal: recreate the store with version+1 when it went missing.
        db.close();
        const retry = indexedDB.open(IDB_DB, (db.version || 1) + 1);
        retry.onupgradeneeded = () => {
          retry.result.createObjectStore(IDB_STORE);
        };
        retry.onsuccess = () => resolve(retry.result);
        retry.onerror = () => reject(retry.error);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/** IndexedDB mirror (gyschordweb gys-playlist-backup): survives eviction. */
function backupPlaylistToIDB(payload: unknown): void {
  try {
    void openBackupDb("readwrite").then(
      (db) => {
        try {
          const tx = db.transaction(IDB_STORE, "readwrite");
          tx.objectStore(IDB_STORE).put(payload, IDB_KEY);
          tx.oncomplete = () => db.close();
        } catch {
          db.close();
        }
      },
      () => undefined,
    );
  } catch {
    // Backup is best-effort.
  }
}

async function restorePlaylistFromIDB(): Promise<unknown> {
  if (typeof indexedDB === "undefined") return undefined;
  try {
    const db = await openBackupDb("readonly");
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const request = tx.objectStore(IDB_STORE).get(IDB_KEY);
      request.onsuccess = () => {
        db.close();
        resolve(request.result);
      };
      request.onerror = () => {
        db.close();
        resolve(undefined);
      };
    });
  } catch {
    return undefined;
  }
}

/**
 * Translate the gyschordweb auto-next mode into the controller's engine
 * flags. The mode is authoritative; loop/shuffle/autoNext are derived.
 */
export function applyAutoNextMode(mode: AutoNextMode): void {
  hydrate();
  const derived = {
    off: { loop: "off" as const, shuffle: false, autoNext: false },
    number: { loop: "all" as const, shuffle: false, autoNext: true },
    playlist: { loop: "all" as const, shuffle: false, autoNext: true },
    one: { loop: "one" as const, shuffle: false, autoNext: true },
    all: { loop: "all" as const, shuffle: false, autoNext: true },
    "shuffle-all": { loop: "all" as const, shuffle: true, autoNext: true },
    "shuffle-playlist": {
      loop: "all" as const,
      shuffle: true,
      autoNext: true,
    },
  }[mode];
  controller.setOptions({ autoNextMode: mode, ...derived });
  persist();
}

export function getAutoNextMode(): AutoNextMode {
  hydrate();
  return stableSnapshot.autoNextMode;
}

function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  const serialized = localStorage.getItem(STORAGE_KEY);
  if (serialized) {
    try {
      controller.import(serialized);
      stableSnapshot = controller.snapshot();
      return;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  // gyschordweb parity: restore from IndexedDB when localStorage was evicted.
  if (typeof indexedDB !== "undefined") {
    void restorePlaylistFromIDB().then((restored) => {
      if (!restored) return;
      try {
        const serializedBackup = JSON.stringify(restored);
        localStorage.setItem(STORAGE_KEY, serializedBackup);
        controller.import(serializedBackup);
        stableSnapshot = controller.snapshot();
        window.dispatchEvent(new CustomEvent(EVENT_NAME));
      } catch {
        // The backup record can be stale/corrupt; keep localStorage as-is.
      }
    });
  }
}

function persist(): void {
  if (typeof window === "undefined") return;
  stableSnapshot = controller.snapshot();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stableSnapshot));
  } catch {
    // Quota failures must not block the queue; backup path still records it.
  }
  backupPlaylistToIDB(stableSnapshot);
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function getMidiPlaylist(): MidiPlaylist {
  hydrate();
  return stableSnapshot;
}

export function subscribeMidiPlaylist(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onChange = () => listener();
  window.addEventListener(EVENT_NAME, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT_NAME, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function addMidiPlaylistItem(item: MidiPlaylistItem): boolean {
  hydrate();
  const before = controller.snapshot().items.length;
  controller.add(item);
  const added = controller.snapshot().items.length > before;
  if (added) persist();
  return added;
}

export function removeMidiPlaylistItem(songId: string): void {
  hydrate();
  controller.remove(songId);
  persist();
}

export function moveMidiPlaylistItem(from: number, to: number): void {
  hydrate();
  controller.reorder(from, to);
  persist();
}

export function selectMidiPlaylistItem(index: number): void {
  hydrate();
  controller.select(index);
  persist();
}

export function nextMidiPlaylistItem(
  random = Math.random(),
): MidiPlaylistItem | undefined {
  hydrate();
  const item = controller.next(random);
  if (item) persist();
  return item;
}

export function previousMidiPlaylistItem(): MidiPlaylistItem | undefined {
  hydrate();
  const item = controller.previous();
  if (item) persist();
  return item;
}

export function updateMidiPlaylistOptions(
  options: Partial<Omit<MidiPlaylist, "version" | "items" | "currentIndex">>,
): void {
  hydrate();
  controller.setOptions(options);
  persist();
}

export function clearMidiPlaylist(): void {
  hydrate();
  for (const item of controller.snapshot().items)
    controller.remove(item.songId);
  persist();
}

export function exportMidiPlaylist(): string {
  hydrate();
  return controller.export();
}

export function importMidiPlaylist(serialized: string): MidiPlaylist {
  hydrate();
  controller.import(serialized);
  persist();
  return controller.snapshot();
}

export function downloadMidiPlaylist(): void {
  const blob = new Blob([exportMidiPlaylist()], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `gys-midi-playlist-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
