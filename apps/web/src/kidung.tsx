import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  UpstreamMusicLockSchema,
  type HymnCatalogEntry,
  type UpstreamMusicLock,
} from "@gys/contracts";
import { MidiLoader } from "@gys/domain";
import { translate, type Locale } from "./i18n.js";
import { createBrowserChordRepository } from "./chords.js";

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

function isCatalog(value: unknown): value is { items: HymnCatalogEntry[] } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { items?: unknown };
  return (
    Array.isArray(candidate.items) &&
    candidate.items.length > 0 &&
    candidate.items.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof (item as { title?: unknown }).title === "string" &&
        typeof (item as { lyrics?: unknown }).lyrics === "string",
    )
  );
}

function keyAtOffset(offset: number): string {
  return KEYS[((offset % KEYS.length) + KEYS.length) % KEYS.length] ?? "C";
}

export function KidungPage({ locale }: { locale: Locale }) {
  const [catalogState, setCatalogState] = useState<CatalogState>({
    status: "loading",
  });
  const [query, setQuery] = useState("");
  const [book, setBook] = useState("all");
  const [selectedId, setSelectedId] = useState("hymn-001");
  const [transpose, setTranspose] = useState(0);
  const [key, setKey] = useState("C");
  const [notice, setNotice] = useState("");
  const [chordStatus, setChordStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [midiStatus, setMidiStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [musicLock, setMusicLock] = useState<UpstreamMusicLock | undefined>();
  const chordRepository = useMemo(createBrowserChordRepository, []);
  const midiLoader = useMemo(() => new MidiLoader(), []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${import.meta.env.BASE_URL}offline/hymn-catalog.json`, {
      signal: controller.signal,
      cache: "force-cache",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Offline hymn catalog unavailable");
        const json: unknown = await response.json();
        if (!isCatalog(json)) throw new Error("Hymn catalog is invalid");
        setCatalogState({ status: "ready", items: json.items });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setCatalogState({
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
        const parsed = UpstreamMusicLockSchema.parse(await response.json());
        setMusicLock(parsed);
      })
      .catch(() => setMusicLock(undefined));
  }, []);

  const items = catalogState.status === "ready" ? catalogState.items : [];
  const books = useMemo(
    () => [...new Set(items.map((item) => item.book))].sort(),
    [items],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return items
      .filter((item) => book === "all" || item.book === book)
      .filter(
        (item) =>
          !normalized ||
          `${item.number} ${item.title} ${item.lyrics}`
            .toLocaleLowerCase()
            .includes(normalized),
      )
      .sort((left, right) => left.number - right.number);
  }, [book, items, query]);
  const selected =
    items.find((item) => item.id === selectedId) ?? filtered[0] ?? items[0];
  const renderedKey = keyAtOffset(KEYS.indexOf(key) + transpose);

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };
  const loadChord = async () => {
    if (!selected) return;
    setChordStatus("loading");
    try {
      await chordRepository.getChord(selected.id);
      setChordStatus("ready");
      showNotice("Chord diverifikasi dan siap dipakai.");
    } catch {
      setChordStatus("error");
      showNotice(
        "Chord belum tersedia offline; sambungkan internet lalu coba lagi.",
      );
    }
  };
  const loadMidi = async () => {
    if (!selected) return;
    const ref = musicLock?.items.find(
      (item) => item.kind === "midi" && item.path === selected.midiPath,
    );
    if (!ref) {
      setMidiStatus("error");
      showNotice("MIDI belum ada di immutable lock untuk lagu ini.");
      return;
    }
    setMidiStatus("loading");
    try {
      const loaded = await midiLoader.load({
        id: selected.id,
        url: `https://raw.githubusercontent.com/gyspnk/gyschordweb/${musicLock?.sourceCommit ?? "cbc7d386"}/docs/${ref.path}`,
        sourceHash: ref.sha256,
      });
      setMidiStatus("ready");
      showNotice(
        `MIDI tervalidasi · ${loaded.midi.events.length} event siap dijadwalkan.`,
      );
    } catch {
      setMidiStatus("error");
      showNotice(
        "MIDI belum tersedia offline; sambungkan internet lalu coba lagi.",
      );
    }
  };

  return (
    <div className="page hymn-page">
      <section className="page-intro">
        <div>
          <p className="date-line">533 lagu · offline catalog</p>
          <h1>{translate(locale, "page.kidungTitle")}</h1>
          <p className="intro-copy">{translate(locale, "page.kidungBody")}</p>
        </div>
        <button
          className="quiet-button"
          type="button"
          onClick={() =>
            showNotice("MIDI akan diunduh saat lagu pertama kali diputar.")
          }
        >
          TimGM 6 MB <span aria-hidden="true">·</span> siap
        </button>
      </section>

      {catalogState.status === "loading" && (
        <div className="loading-panel" role="status">
          Membuka katalog kidung offline…
        </div>
      )}
      {catalogState.status === "error" && (
        <div className="error-panel" role="alert">
          <strong>Katalog kidung belum tersedia</strong>
          <span>{catalogState.message}</span>
        </div>
      )}

      {items.length > 0 && selected && (
        <div className="hymn-layout">
          <aside className="hymn-browser" aria-label="Hymn catalog">
            <div className="hymn-filter">
              <label htmlFor="hymn-query">Cari lagu</label>
              <input
                id="hymn-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nomor atau judul…"
              />
              <select
                value={book}
                onChange={(event) => setBook(event.target.value)}
              >
                <option value="all">Semua buku</option>
                {books.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className="hymn-list">
              {filtered.slice(0, 80).map((item) => (
                <button
                  className={`hymn-list-item${item.id === selected.id ? " is-selected" : ""}`}
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                >
                  <span>{String(item.number).padStart(3, "0")}</span>
                  <strong>{item.title}</strong>
                </button>
              ))}
            </div>
            <small className="hymn-count">
              {filtered.length} lagu ditemukan
            </small>
          </aside>

          <section className="hymn-detail">
            <div className="hymn-heading">
              <div>
                <p className="date-line">
                  {selected.book} · {String(selected.number).padStart(3, "0")}
                </p>
                <h2>{selected.title}</h2>
              </div>
              <div className="hymn-actions">
                <button
                  className="quiet-button"
                  type="button"
                  onClick={() => void loadChord()}
                  disabled={chordStatus === "loading"}
                >
                  {chordStatus === "loading"
                    ? "Memuat…"
                    : chordStatus === "ready"
                      ? "Chord siap"
                      : "Chord"}
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void loadMidi()}
                  disabled={midiStatus === "loading"}
                >
                  {midiStatus === "loading"
                    ? "Memuat MIDI…"
                    : midiStatus === "ready"
                      ? "MIDI siap"
                      : "Putar MIDI"}
                </button>
              </div>
            </div>
            <div className="song-controls" aria-label="Song controls">
              <label>
                <span>Nada dasar</span>
                <select
                  value={key}
                  onChange={(event) => {
                    setKey(event.target.value);
                    setTranspose(0);
                  }}
                >
                  {KEYS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <div className="transpose-control">
                <span>Transpose · {renderedKey}</span>
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      setTranspose((value) => Math.max(-6, value - 1))
                    }
                    aria-label="Transpose down"
                  >
                    −
                  </button>
                  <strong>{transpose > 0 ? `+${transpose}` : transpose}</strong>
                  <button
                    type="button"
                    onClick={() =>
                      setTranspose((value) => Math.min(6, value + 1))
                    }
                    aria-label="Transpose up"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            <article className="lyrics-sheet" aria-label={selected.title}>
              {selected.lyrics
                .split("\n")
                .map((line, index) =>
                  line.trim() ? (
                    <p key={`${selected.id}-${index}`}>{line}</p>
                  ) : (
                    <div
                      className="lyrics-break"
                      key={`${selected.id}-${index}`}
                    />
                  ),
                )}
            </article>
            <Suspense
              fallback={
                <div className="loading-panel">PDF reader wordt geladen…</div>
              }
            >
              <PdfReader
                src={`${import.meta.env.BASE_URL}${selected.pdfPath.replace(/^assets\//, "assets/")}`}
              />
            </Suspense>
          </section>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
