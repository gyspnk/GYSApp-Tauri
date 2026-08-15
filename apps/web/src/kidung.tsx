import {
  lazy,
  Suspense,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  HymnCatalogEntrySchema,
  UpstreamMusicLockSchema,
  type ChordDocumentV2,
  type HymnCatalogEntry,
  type UpstreamMusicLock,
} from "@gys/contracts";
import { MidiLoader } from "@gys/domain";
import { translate, type Locale } from "./i18n.js";
import { createBrowserChordRepository } from "./chords.js";
import {
  ChordCapability,
  matchChordLinesToLyrics,
  transposeChord,
} from "./chord-viewer.js";
import {
  buildChordPresentationFromPdf,
  type ChordLayoutPage,
} from "./chord-layout-pdf.js";
import type { PdfChordOverlayMarker } from "./pdf.js";
import {
  downloadMusicAsset,
  loadMusicAsset,
  prefetchMusicAsset,
} from "./music-assets.js";
import { midiPlayer } from "./midi-player.js";
import { speechPlayer } from "./speech-player.js";
import { Select } from "./select.js";
import { isFavorite, subscribeFavorites, toggleFavorite } from "./favorites.js";
import { getActivity, setHymnActivity } from "./history.js";
import { loadForkHymnalPdf } from "./fork-pdf.js";
import { buildHymnSearchIndex, searchHymns } from "./hymn-search.js";
import {
  addMidiPlaylistItem,
  getMidiPlaylist,
  selectMidiPlaylistItem,
  subscribeMidiPlaylist,
} from "./midi-playlist.js";
import {
  readHymnViewerMode,
  readHymnChordVisibility,
  type HymnViewerMode,
  writeHymnChordVisibility,
  writeHymnViewerMode,
} from "./hymn-view-mode.js";

const PdfReader = lazy(() =>
  import("./pdf.js").then(({ PdfReader: Component }) => ({
    default: Component,
  })),
);
type CatalogState =
  | { status: "loading" }
  | { status: "ready"; items: HymnCatalogEntry[] }
  | { status: "error"; message: string };
const KEYS = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const FLAT_KEYS = [
  "C",
  "D♭",
  "D",
  "E♭",
  "E",
  "F",
  "G♭",
  "G",
  "A♭",
  "A",
  "B♭",
  "B",
];
const parsedLyricsCache = new Map<string, string[]>();

function getHymnVerses(item: HymnCatalogEntry | undefined): string[] {
  if (!item) return [];
  const key = `${item.id}:${item.lyrics.length}:${item.verses.length}`;
  const cached = parsedLyricsCache.get(key);
  if (cached) return cached;
  const verses = item.verses.length
    ? item.verses
    : item.lyrics.split(/\n\s*\n/).filter(Boolean);
  parsedLyricsCache.set(key, verses);
  while (parsedLyricsCache.size > 96)
    parsedLyricsCache.delete(parsedLyricsCache.keys().next().value as string);
  return verses;
}

function parseCatalog(value: unknown): HymnCatalogEntry[] {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as { items?: unknown }).items)
  )
    throw new Error("Hymn catalog is invalid");
  return (value as { items: unknown[] }).items.map((item) =>
    HymnCatalogEntrySchema.parse(item),
  );
}

function useHymnData() {
  const [catalog, setCatalog] = useState<CatalogState>({ status: "loading" });
  const [musicLock, setMusicLock] = useState<UpstreamMusicLock>();
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${import.meta.env.BASE_URL}offline/hymn-catalog.json`, {
      signal: controller.signal,
      cache: "force-cache",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Offline hymn catalog unavailable");
        setCatalog({
          status: "ready",
          items: parseCatalog(await response.json()),
        });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setCatalog({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to load hymn catalog",
          });
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    void fetch(`${import.meta.env.BASE_URL}offline/music-lock.json`, {
      cache: "force-cache",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("MIDI lock unavailable");
        setMusicLock(UpstreamMusicLockSchema.parse(await response.json()));
      })
      .catch(() => setMusicLock(undefined));
  }, []);
  return { catalog, musicLock };
}

function numberLabel(number: number) {
  return String(number).padStart(3, "0");
}
function uniqueItems(items: HymnCatalogEntry[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.number}:${item.title.trim().toLocaleLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function KidungPage({ locale }: { locale: Locale }) {
  const { songId } = useParams();
  const { catalog, musicLock } = useHymnData();
  if (songId)
    return (
      <HymnDetail
        key={songId}
        locale={locale}
        songId={songId}
        state={catalog}
        {...(musicLock ? { musicLock } : {})}
      />
    );
  return <HymnCatalog locale={locale} state={catalog} />;
}

function HymnCatalog({
  locale,
  state,
}: {
  locale: Locale;
  state: CatalogState;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [book, setBook] = useState("all");
  const deferredQuery = useDeferredValue(query);
  const items = useMemo(
    () => (state.status === "ready" ? uniqueItems(state.items) : []),
    [state],
  );
  const searchIndex = useMemo(() => buildHymnSearchIndex(items), [items]);
  const books = useMemo(
    () => [...new Set(items.map((item) => item.book))].sort(),
    [items],
  );
  const filtered = useMemo(() => {
    return searchHymns(searchIndex, deferredQuery, book);
  }, [book, deferredQuery, searchIndex]);
  return (
    <div className="page hymn-page">
      <section className="page-intro">
        <div>
          <p className="date-line">
            {items.length > 0
              ? `${items.length} lagu · katalog canonical`
              : "Katalog canonical"}
          </p>
          <h1>{translate(locale, "page.kidungTitle")}</h1>
          <p className="intro-copy">
            Pilih satu pujian untuk membuka lirik per bait, chord, PDF, atau
            iringan MIDI.
          </p>
        </div>
        <span className="pack-badge">
          {items.length > 0 ? `Offline · ${items.length}` : "Offline"}
        </span>
      </section>
      {state.status === "loading" && (
        <div className="loading-panel" role="status">
          Membuka katalog kidung offline…
        </div>
      )}
      {state.status === "error" && (
        <div className="error-panel" role="alert">
          <strong>Katalog kidung belum tersedia</strong>
          <span>{state.message}</span>
        </div>
      )}
      {state.status === "ready" && (
        <section className="hymn-catalog-shell">
          <div className="catalog-toolbar">
            <label className="search-field">
              <span>Cari lagu</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nomor atau judul…"
              />
            </label>
            <Select
              value={book}
              onChange={setBook}
              label="Koleksi"
              options={[
                { value: "all", label: "Semua koleksi" },
                ...books.map((value) => ({ value, label: value })),
              ]}
            />
          </div>
          <div className="catalog-heading">
            <div>
              <p className="date-line">GysChordWeb · daftar pujian</p>
              <h2>{filtered.length} lagu tersedia</h2>
            </div>
            <small>Ketuk baris untuk membuka detail</small>
          </div>
          <ol className="pujian-list">
            {filtered.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="pujian-row"
                  onClick={() => navigate(`/kidung/${item.id}`)}
                >
                  <span className="pujian-number">
                    {numberLabel(item.number)}
                  </span>
                  <span className="pujian-copy">
                    <strong>{item.title}</strong>
                    <small>
                      {item.book} · {item.verses.length} bait · PDF{" "}
                      {item.pdfPath ? "tersedia" : "—"}
                    </small>
                  </span>
                  <span className="pujian-arrow" aria-hidden="true">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function HymnDetail({
  locale,
  songId,
  state,
  musicLock,
}: {
  locale: Locale;
  songId: string;
  state: CatalogState;
  musicLock?: UpstreamMusicLock;
}) {
  const navigate = useNavigate();
  const item =
    state.status === "ready"
      ? state.items.find((candidate) => candidate.id === songId)
      : undefined;
  const [verseIndex, setVerseIndex] = useState(() => {
    const last = getActivity().hymn;
    return last?.id === songId ? Math.max(0, last.verseIndex) : 0;
  });
  const [transpose, setTranspose] = useState(0);
  const [key, setKey] = useState("C");
  const [accidental, setAccidental] = useState<"sharp" | "flat">("sharp");
  const [chordStatus, setChordStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [chordDocument, setChordDocument] = useState<ChordDocumentV2>();
  const [chordLayout, setChordLayout] = useState<ChordLayoutPage[]>([]);
  const [chordOverlays, setChordOverlays] = useState<
    Record<string, PdfChordOverlayMarker[]>
  >({});
  const [chordsVisible, setChordsVisible] = useState(() =>
    readHymnChordVisibility(songId),
  );
  const [midiStatus, setMidiStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [viewerMode, setViewerMode] = useState<HymnViewerMode>(() =>
    readHymnViewerMode(songId),
  );
  const [pdfUrl, setPdfUrl] = useState<string>();
  const [pdfBytes, setPdfBytes] = useState<Uint8Array>();
  const [pdfInitialPage, setPdfInitialPage] = useState(1);
  const [pdfSource, setPdfSource] = useState<"fork" | "canonical">("fork");
  const [pdfStatus, setPdfStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [notice, setNotice] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [playlist, setPlaylist] = useState(() => getMidiPlaylist());
  const touchStartX = useRef<number | undefined>(undefined);
  const autoLoadedSong = useRef<string | undefined>(undefined);
  const chordRun = useRef(0);
  const chordAbort = useRef<AbortController | undefined>(undefined);
  const pdfRun = useRef(0);
  const chordRepository = useMemo(createBrowserChordRepository, []);
  const midiLoader = useMemo(() => new MidiLoader(), []);
  const verses = getHymnVerses(item);
  const safeVerseIndex = Math.min(verseIndex, Math.max(0, verses.length - 1));
  const sequence = state.status === "ready" ? uniqueItems(state.items) : [];
  const index = item
    ? sequence.findIndex((candidate) => candidate.id === item.id)
    : -1;
  const prev = index > 0 ? sequence[index - 1] : undefined;
  const next = index >= 0 ? sequence[index + 1] : undefined;
  useEffect(() => {
    if (item)
      setHymnActivity(
        { id: item.id, title: item.title, number: item.number },
        safeVerseIndex,
      );
  }, [item, safeVerseIndex]);
  useEffect(() => {
    if (!item) return;
    setFavorite(isFavorite("hymn", item.id));
    return subscribeFavorites(() => setFavorite(isFavorite("hymn", item.id)));
  }, [item]);
  useEffect(
    () => subscribeMidiPlaylist(() => setPlaylist(getMidiPlaylist())),
    [],
  );
  useEffect(
    () => () => {
      chordRun.current += 1;
      chordAbort.current?.abort();
      pdfRun.current += 1;
    },
    [],
  );
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);
  useEffect(() => {
    if (
      !item ||
      !musicLock ||
      typeof navigator === "undefined" ||
      !navigator.onLine
    )
      return;
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    if (connection?.saveData || connection?.effectiveType === "2g") return;
    const candidates = [prev, next].filter(
      (candidate): candidate is HymnCatalogEntry => Boolean(candidate),
    );
    for (const candidate of candidates) {
      void chordRepository.getChord(candidate.id).catch(() => undefined);
      const ref = musicLock.items.find(
        (asset) => asset.kind === "midi" && asset.path === candidate.midiPath,
      );
      void prefetchMusicAsset(ref);
    }
  }, [chordRepository, item, musicLock, next, prev]);
  useEffect(() => {
    if (!item || autoLoadedSong.current === item.id) return;
    autoLoadedSong.current = item.id;
    const saved = readHymnViewerMode(item.id);
    if (saved === "pdf" && pdfStatus === "idle") void loadPdf();
    if (chordsVisible && chordStatus === "idle") void loadChord();
  }, [item, chordStatus, chordsVisible, pdfStatus]);
  const lyricLines = (verses[safeVerseIndex] ?? "").split("\n");
  const chordLines = useMemo(
    () =>
      matchChordLinesToLyrics(
        lyricLines,
        chordDocument,
        chordLayout,
        safeVerseIndex,
      ),
    [chordDocument, chordLayout, safeVerseIndex, lyricLines.join("\n")],
  );
  const pdfChordOverlays = useMemo(() => {
    const offset = pdfSource === "fork" ? Math.max(0, pdfInitialPage - 1) : 0;
    return Object.fromEntries(
      Object.entries(chordOverlays).map(([page, markers]) => [
        String(Number(page) + offset),
        markers.map((marker) => ({
          ...marker,
          chord: transposeChord(marker.chord, transpose, accidental),
        })),
      ]),
    );
  }, [accidental, chordOverlays, pdfInitialPage, pdfSource, transpose]);
  if (state.status === "loading")
    return (
      <div className="page">
        <div className="loading-panel" role="status">
          Membuka pujian…
        </div>
      </div>
    );
  if (state.status === "error" || !item)
    return (
      <div className="page">
        <div className="error-panel" role="alert">
          <strong>Pujian tidak ditemukan</strong>
          <Link className="quiet-button" to="/kidung">
            Kembali ke daftar
          </Link>
        </div>
      </div>
    );
  const show = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };
  const toggle = () => {
    if (!item) return;
    const next = toggleFavorite({
      kind: "hymn",
      id: item.id,
      title: item.title,
    });
    setFavorite(next);
    show(next ? "Kidung disimpan sebagai favorit." : "Favorit dihapus.");
  };
  const onVerseTouchStart = (event: TouchEvent<HTMLElement>) => {
    if (event.touches.length === 1)
      touchStartX.current = event.touches[0]?.clientX;
  };
  const onVerseTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = touchStartX.current;
    touchStartX.current = undefined;
    if (start === undefined) return;
    const end = event.changedTouches[0]?.clientX;
    if (end === undefined || Math.abs(end - start) < 56) return;
    setVerseIndex((current) =>
      Math.max(
        0,
        Math.min(verses.length - 1, current + (end < start ? 1 : -1)),
      ),
    );
  };
  const loadChord = async () => {
    const run = ++chordRun.current;
    chordAbort.current?.abort();
    const controller = new AbortController();
    chordAbort.current = controller;
    setChordStatus("loading");
    setChordLayout([]);
    setChordOverlays({});
    try {
      const nextDocument = await chordRepository.getChord(
        item.id,
        controller.signal,
      );
      if (controller.signal.aborted || run !== chordRun.current) return;
      let nextLayout: ChordLayoutPage[] = [];
      let nextOverlays: Record<string, PdfChordOverlayMarker[]> = {};
      if ("type" in nextDocument && nextDocument.type === "note-aligned") {
        const pdfRef = musicLock?.items.find(
          (candidate) =>
            candidate.kind === "pdf" && candidate.path === item.pdfPath,
        );
        if (pdfRef) {
          try {
            // Reuse a canonical PDF already open in the reader; otherwise the
            // verified asset loader shares one request and caches the bytes.
            const canonicalPdf =
              pdfSource === "canonical" && pdfBytes
                ? pdfBytes
                : await loadMusicAsset(pdfRef);
            const presentation = await buildChordPresentationFromPdf(
              canonicalPdf,
              nextDocument.pages,
              `${item.id}:${pdfRef.sha256}`,
            );
            if (controller.signal.aborted || run !== chordRun.current) return;
            nextLayout = presentation.layout;
            nextOverlays = presentation.overlays;
          } catch {
            // Chord JSON remains useful offline even when its optional PDF
            // coordinate source is unavailable; the viewer renders a clear
            // degraded note-index fallback below.
            show("Chord tersedia; layout PDF akan dicoba lagi saat online.");
          }
        }
      }
      setChordDocument(nextDocument);
      setChordLayout(nextLayout);
      setChordOverlays(nextOverlays);
      setChordStatus("ready");
      if (nextLayout.length > 0 || Object.keys(nextOverlays).length > 0)
        show("Chord diverifikasi dari PDF canonical.");
      else show("Chord diverifikasi dari sumber canonical.");
    } catch {
      if (controller.signal.aborted || run !== chordRun.current) return;
      setChordStatus("error");
      show("Chord belum tersedia offline; sambungkan internet lalu coba lagi.");
    } finally {
      if (chordAbort.current === controller) chordAbort.current = undefined;
    }
  };
  const loadPdf = async () => {
    const run = ++pdfRun.current;
    setViewerMode("pdf");
    writeHymnViewerMode(item.id, "pdf");
    setPdfStatus("loading");
    try {
      let bytes: Uint8Array;
      let initialPage = 1;
      let source: "fork" | "canonical" = "fork";
      try {
        const forkPdf = await loadForkHymnalPdf(item.number);
        if (run !== pdfRun.current) return;
        bytes = forkPdf.bytes;
        initialPage = forkPdf.initialPage;
      } catch {
        const ref = musicLock?.items.find(
          (candidate) =>
            candidate.kind === "pdf" && candidate.path === item.pdfPath,
        );
        if (!ref) throw new Error("PDF unavailable");
        bytes = await loadMusicAsset(ref);
        if (run !== pdfRun.current) return;
        source = "canonical";
      }
      const nextUrl = URL.createObjectURL(
        new Blob([bytes.slice().buffer as ArrayBuffer], {
          type: "application/pdf",
        }),
      );
      setPdfBytes(bytes);
      setPdfInitialPage(initialPage);
      setPdfSource(source);
      setPdfUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return nextUrl;
      });
      setPdfStatus("ready");
      show(
        source === "fork"
          ? "PDF Kidung Rohani dibuka dari database GYSApp-Fork."
          : "PDF canonical dibuka sebagai fallback.",
      );
    } catch {
      if (run !== pdfRun.current) return;
      setPdfStatus("error");
      show("PDF gagal dimuat. Periksa koneksi atau cache.");
    }
  };
  const selectViewerMode = (mode: HymnViewerMode) => {
    writeHymnViewerMode(item.id, mode);
    setViewerMode(mode);
    if (mode === "pdf" && pdfStatus !== "ready") void loadPdf();
  };
  const toggleChords = () => {
    const next = !chordsVisible;
    setChordsVisible(next);
    writeHymnChordVisibility(item.id, next);
    if (next && chordStatus !== "ready" && chordStatus !== "loading")
      void loadChord();
  };
  const loadMidi = async () => {
    if (!musicLock) {
      setMidiStatus("error");
      show("MIDI lock belum siap; coba lagi sebentar.");
      return;
    }
    const ref = musicLock.items.find(
      (candidate) =>
        candidate.kind === "midi" && candidate.path === item.midiPath,
    );
    if (!ref) {
      setMidiStatus("error");
      show("MIDI belum tersedia pada lock asset.");
      return;
    }
    setMidiStatus("loading");
    try {
      const bytes = await loadMusicAsset(ref);
      const loaded = await midiLoader.load({
        id: item.id,
        url: `https://raw.githubusercontent.com/gyspnk/gyschordweb/${musicLock.sourceCommit}/docs/${ref.path}`,
        sourceHash: ref.sha256,
        bytes,
      });
      await midiPlayer.load(item.id, item.title, loaded.midi, {
        rawMidi: bytes,
        sourceHash: ref.sha256,
      });
      const queueIndex = getMidiPlaylist().items.findIndex(
        (entry) => entry.songId === item.id,
      );
      if (queueIndex >= 0) selectMidiPlaylistItem(queueIndex);
      setMidiStatus("ready");
      // Loading the binary/parser is independent from starting Web Audio.
      // Browsers may reject an AudioContext created after the network await;
      // the shared floating player remains ready so the next user gesture can
      // start playback without losing the successfully loaded MIDI.
      try {
        await speechPlayer.stop();
        await midiPlayer.play();
        show("MIDI sedang diputar; pemutar dapat diminimalkan.");
      } catch {
        show("MIDI siap; tekan Putar pada pemutar untuk mengaktifkan suara.");
      }
    } catch {
      setMidiStatus("error");
      show("MIDI belum dapat dimuat. Coba lagi saat online.");
    }
  };
  const renderedKey = (accidental === "flat" ? FLAT_KEYS : KEYS)[
    (((KEYS.indexOf(key) + transpose) % KEYS.length) + KEYS.length) %
      KEYS.length
  ];
  return (
    <div className="page hymn-detail-page">
      <div className="detail-back">
        <Link className="text-button" to="/kidung">
          ← Semua kidung
        </Link>
        <span>
          {numberLabel(item.number)} · {item.book}
        </span>
      </div>
      <section className="detail-hero">
        <div>
          <p className="date-line">
            Kidung Rohani · {numberLabel(item.number)}
          </p>
          <h1>{item.title}</h1>
          <p className="intro-copy">
            Lirik per bait dari katalog GYSChordWeb. Pilih mode baca sesuai
            kebutuhan.
          </p>
        </div>
        <div className="detail-neighbors">
          <button
            type="button"
            className="quiet-button"
            disabled={!prev}
            onClick={() => prev && navigate(`/kidung/${prev.id}`)}
          >
            Sebelumnya
          </button>
          <button
            type="button"
            className="quiet-button"
            disabled={!next}
            onClick={() => next && navigate(`/kidung/${next.id}`)}
          >
            Berikutnya
          </button>
        </div>
      </section>
      <section className="hymn-detail-surface">
        <div className="detail-actions">
          <button
            type="button"
            className="quiet-button"
            onClick={toggleChords}
            disabled={chordStatus === "loading"}
            aria-pressed={chordsVisible}
          >
            {chordStatus === "loading"
              ? "Memuat chord…"
              : chordsVisible
                ? "Sembunyikan chord"
                : "Tampilkan chord"}
          </button>
          <button
            type="button"
            className="quiet-button"
            onClick={toggle}
            aria-pressed={favorite}
          >
            {favorite ? "★ Favorit" : "☆ Simpan favorit"}
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => void loadMidi()}
            disabled={midiStatus === "loading"}
          >
            {midiStatus === "loading"
              ? "Memuat MIDI…"
              : midiStatus === "ready"
                ? "MIDI siap"
                : "Putar MIDI"}
          </button>
          <button
            type="button"
            className="quiet-button"
            aria-pressed={playlist.items.some(
              (entry) => entry.songId === item.id,
            )}
            onClick={() => {
              const added = addMidiPlaylistItem({
                songId: item.id,
                title: item.title,
                ...(musicLock?.items.find(
                  (asset) =>
                    asset.kind === "midi" && asset.path === item.midiPath,
                )?.sha256
                  ? {
                      sourceHash: musicLock.items.find(
                        (asset) =>
                          asset.kind === "midi" && asset.path === item.midiPath,
                      )?.sha256,
                    }
                  : {}),
              });
              show(
                added
                  ? "Kidung ditambahkan ke antrean MIDI."
                  : "Kidung sudah ada di antrean MIDI.",
              );
            }}
          >
            {playlist.items.some((entry) => entry.songId === item.id)
              ? `Di antrean · ${playlist.items.length}`
              : "Tambah antrean MIDI"}
          </button>
          <button
            type="button"
            className="quiet-button"
            onClick={() =>
              viewerMode === "pdf"
                ? selectViewerMode("lyrics")
                : selectViewerMode("pdf")
            }
            disabled={pdfStatus === "loading"}
          >
            {pdfStatus === "loading"
              ? "Memuat PDF…"
              : viewerMode === "pdf"
                ? "Tutup PDF"
                : "Buka PDF"}
          </button>
          {pdfBytes && (
            <button
              type="button"
              className="quiet-button"
              onClick={() => {
                const ref = musicLock?.items.find(
                  (candidate) =>
                    candidate.kind === "pdf" && candidate.path === item.pdfPath,
                );
                if (pdfSource === "canonical" && ref)
                  downloadMusicAsset(ref, pdfBytes);
                if (pdfSource === "fork")
                  downloadMusicAsset(
                    {
                      id: `KR-${numberLabel(item.number)}`,
                      path: "kr_master.pdf",
                    },
                    pdfBytes,
                  );
              }}
            >
              Unduh PDF
            </button>
          )}
        </div>
        <div className="song-controls">
          <Select
            value={key}
            onChange={(value) => {
              setKey(value);
              setTranspose(0);
            }}
            label="Nada dasar"
            options={KEYS.map((value) => ({ value, label: value }))}
          />
          <Select
            value={accidental}
            onChange={setAccidental}
            label="Notasi chord"
            options={[
              { value: "sharp", label: "♯ Sharp" },
              { value: "flat", label: "♭ Flat" },
            ]}
          />
          <div className="transpose-control">
            <span>Nada tampil · {renderedKey}</span>
            <div>
              <button
                type="button"
                onClick={() => setTranspose((value) => Math.max(-6, value - 1))}
              >
                −
              </button>
              <strong>{transpose > 0 ? `+${transpose}` : transpose}</strong>
              <button
                type="button"
                onClick={() => setTranspose((value) => Math.min(6, value + 1))}
              >
                +
              </button>
            </div>
          </div>
        </div>
        <div className="verse-switcher">
          <span>Bait</span>
          <div className="verse-tabs" role="tablist">
            {verses.map((_, index) => (
              <button
                type="button"
                role="tab"
                aria-selected={index === safeVerseIndex}
                className={index === safeVerseIndex ? "is-active" : ""}
                key={index}
                onClick={() => setVerseIndex(index)}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <Select
            value={safeVerseIndex}
            onChange={setVerseIndex}
            label="Pilih bait"
            options={verses.map((_, index) => ({
              value: index,
              label: `Bait ${index + 1}`,
            }))}
          />
        </div>
        <div
          className="viewer-mode-tabs"
          role="tablist"
          aria-label="Mode tampilan kidung"
        >
          {(
            [
              ["lyrics", "Lirik"],
              ["pdf", "PDF"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={viewerMode === mode}
              className={
                viewerMode === mode
                  ? "viewer-mode-tab is-active"
                  : "viewer-mode-tab"
              }
              onClick={() => selectViewerMode(mode)}
              disabled={mode === "pdf" && pdfStatus === "loading"}
            >
              {mode === "pdf" && pdfStatus === "loading"
                ? "Memuat PDF…"
                : label}
            </button>
          ))}
        </div>
        {viewerMode === "lyrics" && (
          <article
            className="lyrics-sheet verse-enter"
            key={`${item.id}-${safeVerseIndex}`}
            aria-label={`${item.title}, bait ${safeVerseIndex + 1}`}
            onTouchStart={onVerseTouchStart}
            onTouchEnd={onVerseTouchEnd}
          >
            {lyricLines.map((line, index) => {
              const chordLine = chordsVisible ? chordLines[index] : undefined;
              return (
                <p key={`${index}-${line}`}>
                  {chordLine && chordLine.chords.length > 0 ? (
                    <ChordCapability
                      lines={[chordLine]}
                      transpose={transpose}
                      accidental={accidental}
                    />
                  ) : (
                    line || " "
                  )}
                </p>
              );
            })}
          </article>
        )}
        {chordsVisible && chordStatus === "loading" && (
          <div className="loading-panel" role="status">
            Chord sedang diverifikasi…
          </div>
        )}
        {chordsVisible && chordStatus === "error" && (
          <div className="error-panel" role="alert">
            <strong>Chord belum tersedia</strong>
            <span>Sambungkan internet lalu coba lagi.</span>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void loadChord()}
            >
              Coba lagi
            </button>
          </div>
        )}
        {viewerMode === "pdf" && pdfStatus === "loading" && (
          <div className="loading-panel" role="status">
            PDF reader sedang dibuka…
          </div>
        )}
        {viewerMode === "pdf" && pdfStatus === "error" && (
          <div className="error-panel" role="alert">
            <strong>PDF gagal dimuat</strong>
            <span>Periksa koneksi atau cache, lalu coba lagi.</span>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void loadPdf()}
            >
              Coba lagi
            </button>
          </div>
        )}
        {viewerMode === "pdf" && pdfStatus === "ready" && (
          <Suspense
            fallback={
              <div className="loading-panel">PDF reader sedang dibuka…</div>
            }
          >
            <PdfReader
              src={pdfUrl ?? ""}
              {...(pdfBytes ? { data: pdfBytes } : {})}
              initialPage={pdfInitialPage}
              progressKey={item.id}
              {...(pdfUrl ? { downloadUrl: pdfUrl } : {})}
              title={item.title}
              chordOverlays={pdfChordOverlays}
              chordsVisible={chordsVisible}
            />
          </Suspense>
        )}
      </section>
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
