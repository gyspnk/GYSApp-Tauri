/**
 * Multiple saved playlists (gyschordweb PlaylistManager parity).
 *
 * A saved playlist references songs by id. An active playlist is the target
 * of "add to playlist" from the hymn detail; "load" copies its song ids into
 * the live MIDI queue. Every mutation is mirrored into the same
 * `gys-playlist-backup` IndexedDB database used by midi-playlist.ts, so an
 * evicted localStorage cannot destroy user data.
 */
import type { HymnMetadata, MidiPlaylistItem } from "@gys/contracts";

export type SavedPlaylist = {
  id: string;
  name: string;
  songIds: string[];
  createdAt: number;
};

export function importUpstreamPlaylist(
  value: unknown,
  catalog: readonly HymnMetadata[],
): { name: string; songIds: string[] } {
  if (!value || typeof value !== "object")
    throw new Error("Playlist JSON must be an object");
  const source = value as { name?: unknown; songs?: unknown };
  if (
    typeof source.name !== "string" ||
    !source.name.trim() ||
    !Array.isArray(source.songs)
  )
    throw new Error("Playlist JSON has no name or songs");

  const catalogIds = new Map(
    catalog.map((entry) => [entry.id.toLowerCase(), entry.id]),
  );
  const songIds: string[] = [];
  for (const song of source.songs) {
    if (!song || typeof song !== "object")
      throw new Error("Playlist contains an invalid song");
    const record = song as { nomor?: unknown; judul?: unknown };
    if (typeof record.judul !== "string" || !record.judul.trim())
      throw new Error("Playlist contains an invalid song title");
    const match = String(record.nomor ?? "")
      .trim()
      .match(/^(\d{1,3})([a-z])?$/i);
    if (!match) throw new Error("Playlist contains an invalid song number");
    const sourceId = `hymn-${match[1]!.padStart(3, "0")}${match[2] ?? ""}`;
    const songId = catalogIds.get(sourceId.toLowerCase());
    if (!songId)
      throw new Error(`Playlist song ${record.nomor} is not in the catalog`);
    if (!songIds.includes(songId)) songIds.push(songId);
  }
  return { name: source.name.trim(), songIds };
}

export function exportUpstreamPlaylist(
  playlist: SavedPlaylist,
  catalog: readonly HymnMetadata[],
): {
  name: string;
  songs: Array<{ nomor: string; judul: string; fileHref: string }>;
} {
  const entries = new Map(catalog.map((entry) => [entry.id, entry]));
  return {
    name: playlist.name,
    songs: playlist.songIds.map((songId) => {
      const entry = entries.get(songId);
      if (!entry) throw new Error(`Playlist song ${songId} is unavailable`);
      const number = entry.id.match(/^hymn-(\d{3}[a-z]?)$/i)?.[1];
      if (!number)
        throw new Error(`Playlist song ${songId} has no source number`);
      return {
        nomor: number,
        judul: entry.title,
        fileHref: entry.midiPath,
      };
    }),
  };
}

export function reorderSavedPlaylistSongs(
  songIds: string[],
  from: number,
  to: number,
): string[] {
  if (
    from < 0 ||
    from >= songIds.length ||
    to < 0 ||
    to >= songIds.length ||
    from === to
  )
    return songIds;
  const reordered = [...songIds];
  const [songId] = reordered.splice(from, 1);
  if (songId !== undefined) reordered.splice(to, 0, songId);
  return reordered;
}

const STORAGE_KEY = "gys-kidung-playlists-v1";
const ACTIVE_KEY = "gys-kidung-active-playlist";
const EVENT_NAME = "gys-kidung-playlists-change";
const IDB_DB = "gys-playlist-backup";
const IDB_STORE = "kv";
const IDB_KEY = "saved-playlists";

let hydrated = false;
let playlists: SavedPlaylist[] = [];
let snapshotCache: SavedPlaylist[] | undefined;

function invalidateSnapshotCache(): void {
  snapshotCache = undefined;
}

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
        let activePlaylistId: string | null = null;
        try {
          activePlaylistId = localStorage.getItem(ACTIVE_KEY);
        } catch {
          // The playlist backup still survives when local storage is blocked.
        }
        tx.objectStore(IDB_STORE).put(
          { playlists, activePlaylistId, savedAt: Date.now() },
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
  const shouldRestorePlaylists = localStorage.getItem(STORAGE_KEY) === null;
  const shouldRestoreActivePlaylist = localStorage.getItem(ACTIVE_KEY) === null;
  if (!shouldRestorePlaylists && !shouldRestoreActivePlaylist) return;
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
      const backup = get.result as
        | {
            playlists?: SavedPlaylist[];
            activePlaylistId?: string | null;
          }
        | undefined;
      if (!backup?.playlists) return;
      let restored = false;
      if (localStorage.getItem(STORAGE_KEY) === null) {
        playlists = backup.playlists;
        invalidateSnapshotCache();
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
        } catch {
          // Keep the in-memory copy only.
        }
        restored = true;
      }
      if (
        localStorage.getItem(ACTIVE_KEY) === null &&
        backup.activePlaylistId &&
        backup.playlists.some(
          (playlist) => playlist.id === backup.activePlaylistId,
        )
      ) {
        try {
          localStorage.setItem(ACTIVE_KEY, backup.activePlaylistId);
          restored = true;
        } catch {
          // Keep the active selection in the IndexedDB backup.
        }
      }
      if (restored) window.dispatchEvent(new CustomEvent(EVENT_NAME));
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
  }
  restoreFromIDB();
}

function persist(): void {
  if (typeof window === "undefined") return;
  invalidateSnapshotCache();
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
  snapshotCache ??= playlists.map((playlist) => ({
    ...playlist,
    songIds: [...playlist.songIds],
  }));
  return snapshotCache;
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

export function createSavedPlaylist(
  name: string,
  songIds: string[] = [],
): SavedPlaylist {
  hydrate();
  const playlist: SavedPlaylist = {
    id: makeId(),
    name: name.trim() || "Playlist Baru",
    songIds: [...new Set(songIds)],
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
  backupToIDB();
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
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

export function moveSavedPlaylistSong(
  playlistId: string,
  from: number,
  to: number,
): void {
  hydrate();
  const playlist = playlists.find((candidate) => candidate.id === playlistId);
  if (!playlist) return;
  const reordered = reorderSavedPlaylistSongs(playlist.songIds, from, to);
  if (reordered === playlist.songIds) return;
  playlist.songIds = reordered;
  persist();
}

/** Loads the saved playlist's songs into the live MIDI queue (replaces it). */
export function playlistItemsOf(playlist: SavedPlaylist): MidiPlaylistItem[] {
  return playlist.songIds.map((songId) => ({ songId, title: songId }));
}
