import type { HymnCatalogEntry, MidiPlaylistItem } from "@gys/contracts";
import { MidiLoader } from "@gys/domain";
import { midiPlayer } from "./midi-player.js";
import {
  findMusicAsset,
  loadMusicAsset,
  loadMusicLock,
} from "./music-assets.js";
import {
  getMidiPlaylist,
  nextMidiPlaylistItem,
  previousMidiPlaylistItem,
  selectMidiPlaylistItem,
} from "./midi-playlist.js";
import { speechPlayer } from "./speech-player.js";
import { readNaturalChordPreference } from "./hymn-preferences.js";

type CatalogState = HymnCatalogEntry[];

let catalogPromise: Promise<CatalogState> | undefined;
let loader: MidiLoader | undefined;
const inFlight = new Map<string, Promise<void>>();
let coordinatorInstalled = false;
/** gyschordweb shuffleHistory: previous-song jumps back through history. */
const SHUFFLE_HISTORY_MAX = 50;
const shuffleHistory: string[] = [];

function pushShuffleHistory(songId: string | undefined): void {
  if (!songId) return;
  shuffleHistory.push(songId);
  if (shuffleHistory.length > SHUFFLE_HISTORY_MAX) shuffleHistory.shift();
}

export function shuffleHistorySnapshot(): string[] {
  return [...shuffleHistory];
}

async function loadCatalog(): Promise<CatalogState> {
  catalogPromise ??= import("./hymn-payloads.js")
    .then((m) => m.loadCoreHymns())
    .catch((error) => {
      catalogPromise = undefined;
      throw error;
    });
  return catalogPromise;
}

async function loadItem(
  item: MidiPlaylistItem,
  options: { keepPlaying?: boolean } = {},
): Promise<void> {
  // The shell installs queue coordination before any audio is requested.
  // Load PDF-derived song defaults only with playback, alongside the catalog.
  const [catalog, { resolveHymnMidiDefaults, warmHymnPdfMeta }] =
    await Promise.all([loadCatalog(), import("./hymn-pdf-meta.js")]);
  const hymn = catalog.find((candidate) => candidate.id === item.songId);
  if (!hymn) throw new Error(`Kidung ${item.songId} tidak ditemukan`);
  const songMetaPromise = warmHymnPdfMeta(hymn);
  const lock = await loadMusicLock();
  const ref = findMusicAsset(lock, "midi", hymn.midiPath);
  if (!ref) throw new Error(`MIDI ${hymn.title} tidak tersedia`);
  if (item.sourceHash && item.sourceHash !== ref.sha256)
    throw new Error("MIDI antrean sudah berubah; tambahkan ulang lagu ini");
  const bytes = await loadMusicAsset(ref);
  loader ??= new MidiLoader();
  const parsed = await loader.load({
    id: hymn.id,
    url: `https://raw.githubusercontent.com/gyspnk/gyschordweb/${lock.sourceCommit}/docs/${ref.path}`,
    sourceHash: ref.sha256,
    bytes,
  });
  const songMeta = await songMetaPromise;
  const naturalChords = readNaturalChordPreference();
  const midiDefaults = resolveHymnMidiDefaults(songMeta, naturalChords);
  const transpose = midiPlayer.hasTransposePreference(hymn.id)
    ? midiPlayer.settingsSnapshot().transpose
    : midiDefaults.transpose;
  // keepPlaying: A/B crossfade keeps the previous buffer audible while the
  // next buffer renders (gyschordweb _deckA/_deckB gapless behaviour).
  const previousWasPlaying =
    options.keepPlaying === true && midiPlayer.isPlaying();
  if (!previousWasPlaying) await speechPlayer.pause();
  const loadedIntoPlayer = await midiPlayer.load(
    hymn.id,
    hymn.title,
    parsed.midi,
    {
      rawMidi: bytes,
      sourceHash: ref.sha256,
      keepPlaying: previousWasPlaying,
      tempo: midiDefaults.tempo,
      transpose,
    },
  );
  if (!loadedIntoPlayer) return;
  await midiPlayer.play();
}

export async function playMidiPlaylistItem(songId: string): Promise<void> {
  const existing = inFlight.get(songId);
  if (existing) return existing;
  const item = getMidiPlaylist().items.find(
    (candidate) => candidate.songId === songId,
  );
  if (!item) throw new Error("Lagu tidak ada di antrean MIDI");
  const crossfadeMs = getMidiPlaylist().crossfadeMs;
  const crossfade = crossfadeMs > 0 && midiPlayer.isPlaying();
  const request = loadItem(item, { keepPlaying: crossfade }).finally(() =>
    inFlight.delete(songId),
  );
  inFlight.set(songId, request);
  await request;
}

export async function playNextMidiPlaylistItem(): Promise<void> {
  const currentSongId = midiPlayer.snapshot().songId;
  const playlist = getMidiPlaylist();
  const currentIndex = playlist.items.findIndex(
    (item) => item.songId === currentSongId,
  );
  if (currentIndex < 0) return;
  if (playlist.currentIndex !== currentIndex)
    selectMidiPlaylistItem(currentIndex);
  if (playlist.shuffle) pushShuffleHistory(currentSongId);
  const next = nextMidiPlaylistItem();
  if (next) await playMidiPlaylistItem(next.songId);
}

export async function playPreviousMidiPlaylistItem(): Promise<void> {
  const currentSongId = midiPlayer.snapshot().songId;
  const playlist = getMidiPlaylist();
  const currentIndex = playlist.items.findIndex(
    (item) => item.songId === currentSongId,
  );
  if (currentIndex < 0) return;
  if (playlist.currentIndex !== currentIndex)
    selectMidiPlaylistItem(currentIndex);
  // gyschordweb shuffle history: jump back instead of random again.
  if (playlist.shuffle && shuffleHistory.length > 0) {
    const previous = shuffleHistory.pop();
    if (previous && previous !== currentSongId) {
      await playMidiPlaylistItem(previous);
      return;
    }
  }
  const previous = previousMidiPlaylistItem();
  if (previous) await playMidiPlaylistItem(previous.songId);
}

/** Manual transport uses the queue when present, otherwise adjacent hymns
 * in the current collection. This does not change the auto-next preference. */
export async function playAdjacentMidiHymn(direction: -1 | 1): Promise<void> {
  const current = midiPlayer.snapshot().songId;
  const playlist = getMidiPlaylist();
  if (
    playlist.items.length > 1 &&
    playlist.items.some((item) => item.songId === current)
  ) {
    await (direction === 1
      ? playNextMidiPlaylistItem()
      : playPreviousMidiPlaylistItem());
    return;
  }
  const catalog = await loadCatalog();
  const hymn = catalog.find((item) => item.id === current);
  if (!hymn) return;
  const songs = catalog.filter(
    (item) => item.book === hymn.book && item.midiPath && !item.assetCode,
  );
  const index = songs.findIndex((item) => item.id === current);
  const next = index >= 0 ? songs[index + direction] : undefined;
  if (next) await loadItem({ songId: next.id, title: next.title });
}

export function installMidiQueueCoordinator(): () => void {
  if (coordinatorInstalled) return () => undefined;
  coordinatorInstalled = true;
  // gyschordweb loadCrossfadePrefs: keep the engine settings in sync.
  const syncCrossfade = () =>
    midiPlayer.setCrossfadeMs(getMidiPlaylist().crossfadeMs);
  syncCrossfade();
  window.addEventListener("gys-midi-playlist-change", syncCrossfade);
  const unsubscribeEnded = midiPlayer.subscribeEnded(() => {
    const playlist = getMidiPlaylist();
    if (!playlist.autoNext || !playlist.items.length) return;
    void playNextMidiPlaylistItem().catch(() => undefined);
  });
  return () => {
    window.removeEventListener("gys-midi-playlist-change", syncCrossfade);
    unsubscribeEnded();
    coordinatorInstalled = false;
  };
}
