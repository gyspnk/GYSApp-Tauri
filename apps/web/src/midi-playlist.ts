import { MidiPlaylistController } from "@gys/domain";
import type { MidiPlaylist, MidiPlaylistItem } from "@gys/contracts";

const STORAGE_KEY = "gys-midi-playlist-v1";
const EVENT_NAME = "gys-midi-playlist-change";

// The controller owns playlist invariants (deduplication, reorder, loop and
// shuffle). This adapter adds a durable browser boundary so a queue survives
// route changes, tab reloads, and encrypted backup/export without coupling the
// domain package to localStorage.
const controller = new MidiPlaylistController();
let hydrated = false;
let stableSnapshot: MidiPlaylist = controller.snapshot();

function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  const serialized = localStorage.getItem(STORAGE_KEY);
  if (!serialized) return;
  try {
    controller.import(serialized);
    stableSnapshot = controller.snapshot();
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function persist(): void {
  if (typeof window === "undefined") return;
  stableSnapshot = controller.snapshot();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stableSnapshot));
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
