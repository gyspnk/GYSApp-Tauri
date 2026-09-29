import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playMidiPlaylistItem } from "./midi-queue.js";

const mocks = vi.hoisted(() => ({
  player: {
    hasTransposePreference: vi.fn(() => false),
    settingsSnapshot: vi.fn(() => ({ transpose: 0 })),
    isPlaying: vi.fn(() => false),
    load: vi.fn(async () => true),
    play: vi.fn(async () => undefined),
    setTempo: vi.fn(async () => undefined),
    setTranspose: vi.fn(async () => undefined),
    snapshot: vi.fn(() => ({ songId: "hymn-002", transpose: 0 })),
    setCrossfadeMs: vi.fn(),
    subscribeEnded: vi.fn(() => () => undefined),
  },
  parseMidi: vi.fn(async () => ({
    midi: { ppq: 480, tempo: 100, events: [] },
  })),
  loadMusicLock: vi.fn(async () => ({
    sourceCommit: "upstream-sha",
    items: [],
  })),
  findMusicAsset: vi.fn(() => ({
    path: "docs/assets/002.mid",
    sha256: "a".repeat(64),
  })),
  loadMusicAsset: vi.fn(async () => new Uint8Array([1, 2, 3])),
  getMidiPlaylist: vi.fn(() => ({
    items: [{ songId: "hymn-002", title: "Next hymn" }],
    crossfadeMs: 0,
  })),
  selectMidiPlaylistItem: vi.fn(),
  nextMidiPlaylistItem: vi.fn(),
  previousMidiPlaylistItem: vi.fn(),
  pauseSpeech: vi.fn(async () => undefined),
  getHymnPdfMeta: vi.fn(),
  warmHymnPdfMeta: vi.fn(),
  naturalChords: vi.fn(() => true),
}));

vi.mock("@gys/domain", () => ({
  MidiLoader: class {
    load = mocks.parseMidi;
  },
}));
vi.mock("./midi-player.js", () => ({ midiPlayer: mocks.player }));
vi.mock("./music-assets.js", () => ({
  findMusicAsset: mocks.findMusicAsset,
  loadMusicAsset: mocks.loadMusicAsset,
  loadMusicLock: mocks.loadMusicLock,
}));
vi.mock("./midi-playlist.js", () => ({
  getMidiPlaylist: mocks.getMidiPlaylist,
  nextMidiPlaylistItem: mocks.nextMidiPlaylistItem,
  previousMidiPlaylistItem: mocks.previousMidiPlaylistItem,
  selectMidiPlaylistItem: mocks.selectMidiPlaylistItem,
}));
vi.mock("./speech-player.js", () => ({
  speechPlayer: { pause: mocks.pauseSpeech },
}));
vi.mock("./hymn-pdf-meta.js", () => ({
  getHymnPdfMeta: mocks.getHymnPdfMeta,
  resolveHymnMidiDefaults: (
    meta: { tempo?: number; preloadTranspose?: number } | undefined,
    natural: boolean,
  ) => ({
    tempo: meta?.tempo ?? 76,
    transpose: natural ? (meta?.preloadTranspose ?? 0) : 0,
  }),
  warmHymnPdfMeta: mocks.warmHymnPdfMeta,
}));
vi.mock("./hymn-preferences.js", () => ({
  readNaturalChordPreference: mocks.naturalChords,
}));

const catalog = {
  items: [
    {
      id: "hymn-002",
      book: "rohani",
      number: 2,
      title: "Next hymn",
      verses: ["Verse"],
      lyrics: "Verse",
      midiPath: "docs/assets/002.mid",
      pdfPath: "docs/assets/002.pdf",
    },
  ],
};

describe("MIDI playlist song defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.player.isPlaying.mockReturnValue(false);
    mocks.player.load.mockResolvedValue(true);
    mocks.player.play.mockResolvedValue(undefined);
    mocks.loadMusicLock.mockResolvedValue({
      sourceCommit: "upstream-sha",
      items: [],
    });
    mocks.findMusicAsset.mockReturnValue({
      path: "docs/assets/002.mid",
      sha256: "a".repeat(64),
    });
    mocks.loadMusicAsset.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mocks.getMidiPlaylist.mockReturnValue({
      items: [{ songId: "hymn-002", title: "Next hymn" }],
      crossfadeMs: 0,
    });
    mocks.getHymnPdfMeta.mockReturnValue({ tempo: 84, preloadTranspose: -1 });
    mocks.warmHymnPdfMeta.mockResolvedValue({
      tempo: 84,
      preloadTranspose: -1,
    });
    mocks.naturalChords.mockReturnValue(true);
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => catalog,
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("loads queued songs with their PDF tempo and natural-key transpose", async () => {
    await playMidiPlaylistItem("hymn-002");

    expect(mocks.player.load).toHaveBeenCalledWith(
      "hymn-002",
      "Next hymn",
      { ppq: 480, tempo: 100, events: [] },
      expect.objectContaining({ tempo: 84, transpose: -1, keepPlaying: false }),
    );
    expect(mocks.player.play).toHaveBeenCalledOnce();
  });

  it("uses neutral transpose when natural-chord mode is disabled", async () => {
    mocks.naturalChords.mockReturnValue(false);

    await playMidiPlaylistItem("hymn-002");

    expect(mocks.player.load).toHaveBeenCalledWith(
      "hymn-002",
      "Next hymn",
      { ppq: 480, tempo: 100, events: [] },
      expect.objectContaining({ tempo: 84, transpose: 0 }),
    );
  });

  it("keeps an explicit transpose preference when loading the next queued song", async () => {
    mocks.player.hasTransposePreference.mockReturnValue(true);
    mocks.player.settingsSnapshot.mockReturnValue({ transpose: -2 });

    await playMidiPlaylistItem("hymn-002");

    expect(mocks.player.load).toHaveBeenCalledWith(
      "hymn-002",
      "Next hymn",
      { ppq: 480, tempo: 100, events: [] },
      expect.objectContaining({ tempo: 84, transpose: -2 }),
    );
  });
});
