/**
 * Multiple saved playlists (gyschordweb PlaylistManager parity).
 *
 * A saved playlist references songs by id. An active playlist is the target
 * of "add to playlist" from the hymn detail; "load" copies its song ids into
 * the live MIDI queue. Every mutation is mirrored into the same
 * `gys-playlist-backup` IndexedDB database used by midi-playlist.ts, so an
 * evicted localStorage cannot destroy user data.
 */
import type { MidiPlaylistItem } from "@gys/contracts";

export type SavedPlaylist = {
  id: string;
  name: string;
  songIds: string[];
  createdAt: number;
};

const STORAGE_KEY = "gys-kidung-playlists-v1";
const ACTIVE_KEY = "gys-kidung-active-playlist";
const EVENT_NAME = "gys-kidung-playlists-change";
const IDB_DB = "gys-playlist-backup";
const IDB_STORE = "kv";
const IDB_KEY = "saved-playlists";

let hydrated = false;
let playlists: SavedPlaylist[] = [];

function backupToIDB(): void {
  if (typeof indexedDB === "undefined") return;
  try {
    const request = indexedDB.open(IDB_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(IDB_STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) return;
      try {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(
          { playlists, savedAt: Date.now() },
          IDB_KEY,
        );
        tx.oncomplete = () => db.close();
      } catch {
        db.close();
      }
    };
  } catch {
    // Backup is best-effort.
  }
}

function restoreFromIDB(): void {
  if (typeof indexedDB === "undefined" || typeof window === "undefined") return;
  const serialized = localStorage.getItem(STORAGE_KEY);
  if (serialized) return;
  const request = indexedDB.open(IDB_DB, 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore(IDB_STORE);
  };
  request.onsuccess = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(IDB_STORE)) return;
    const tx = db.transaction(IDB_STORE, "readonly");
    const get = tx.objectStore(IDB_STORE).get(IDB_KEY);
    get.onsuccess = () => {
      db.close();
      const backup = get.result as { playlists?: SavedPlaylist[] } | undefined;
      if (!backup?.playlists) return;
      playlists = backup.playlists;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
      } catch {
        // Keep the in-memory copy only.
      }
      window.dispatchEvent(new CustomEvent(EVENT_NAME));
    };
  };
}

function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  const serialized = localStorage.getItem(STORAGE_KEY);
  if (serialized) {
    try {
      const parsed: unknown = JSON.parse(serialized);
      if (Array.isArray(parsed)) playlists = parsed as SavedPlaylist[];
    } catch {
      playlists = [];
    }
  } else {
    restoreFromIDB();
  }
}

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
  } catch {
    // Quota failures still mirror to IDB below.
  }
  backupToIDB();
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function getSavedPlaylists(): SavedPlaylist[] {
  hydrate();
  return playlists.map((playlist) => ({
    ...playlist,
    songIds: [...playlist.songIds],
  }));
}

export function subscribeSavedPlaylists(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onChange = () => listener();
  window.addEventListener(EVENT_NAME, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT_NAME, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function createSavedPlaylist(name: string): SavedPlaylist {
  hydrate();
  const playlist: SavedPlaylist = {
    id: makeId(),
    name: name.trim() || "Playlist Baru",
    songIds: [],
    createdAt: Date.now(),
  };
  playlists.push(playlist);
  persist();
  return playlist;
}

export function deleteSavedPlaylist(id: string): void {
  hydrate();
  playlists = playlists.filter((playlist) => playlist.id !== id);
  if (getActivePlaylistId() === id) {
    try {
      localStorage.removeItem(ACTIVE_KEY);
    } catch {
      // ignore
    }
  }
  persist();
}

export function renameSavedPlaylist(id: string, name: string): void {
  hydrate();
  const playlist = playlists.find((candidate) => candidate.id === id);
  if (!playlist) return;
  playlist.name = name.trim() || playlist.name;
  persist();
}

export function getActivePlaylistId(): string | null {
  hydrate();
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActivePlaylist(id: string | null): void {
  hydrate();
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // ignore
  }
}

export function addSongToActivePlaylist(songId: string): boolean {
  hydrate();
  const active = getActivePlaylistId();
  const playlist = active
    ? playlists.find((candidate) => candidate.id === active)
    : undefined;
  if (!playlist) return false;
  if (playlist.songIds.includes(songId)) return false;
  playlist.songIds.push(songId);
  persist();
  return true;
}

export function removeSongFromPlaylist(
  playlistId: string,
  songId: string,
): void {
  hydrate();
  const playlist = playlists.find((candidate) => candidate.id === playlistId);
  if (!playlist) return;
  playlist.songIds = playlist.songIds.filter(
    (candidate) => candidate !== songId,
  );
  persist();
}

/** Loads the saved playlist's songs into the live MIDI queue (replaces it). */
export function playlistItemsOf(playlist: SavedPlaylist): MidiPlaylistItem[] {
  return playlist.songIds.map((songId) => ({ songId, title: songId }));
}
