import { LoadingProgress } from "./loading-progress.js";
import { useReadinessMarker } from "./readiness.js";
import { useSyncExternalStore } from "react";
import {
  useEffect,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { type HymnMetadata, type UpstreamMusicLock } from "@gys/contracts";
import { translate, type Locale } from "./i18n.js";
import { findMusicAsset } from "./music-assets.js";
import { Select } from "./select.js";
import { Icon } from "./icons.js";
import { triggerRipple } from "./ripple.js";
import { buildHymnSearchIndex, searchHymns } from "./hymn-search.js";
import {
  addMidiPlaylistItem,
  getMidiPlaylist,
  subscribeMidiPlaylist,
} from "./midi-playlist.js";
import {
  type CatalogState,
  numberLabel,
  hymnCollectionLabel,
  uniqueItems,
} from "./kidung-shared.js";
import { loadHymnSearchCorpus } from "./hymn-search-corpus.js";
import { KidungLocalNav } from "./kidung-local-nav.js";
import { readHymnViewerMode, writeHymnViewerMode } from "./hymn-view-mode.js";
import { navigateSmooth } from "./route-transitions.js";

export function HymnCatalog({
  locale,
  state,
  musicLock,
}: {
  locale: Locale;
  state: CatalogState<HymnMetadata>;
  musicLock?: UpstreamMusicLock;
}) {
  useReadinessMarker("gys-hymn-catalog-ready", state.status === "ready");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pdfMode, setPdfMode] = useState(() => {
    const requested = searchParams.get("mode");
    return (
      requested === "pdf" ||
      (requested !== "lyrics" && readHymnViewerMode() === "pdf")
    );
  });
  const [query, setQuery] = useState("");
  const [book, setBook] = useState("all");
  const deferredQuery = useDeferredValue(query);
  const allItems = useMemo(
    () => (state.status === "ready" ? uniqueItems(state.items) : []),
    [state],
  );
  const midiSongs = useMemo(
    () =>
      new Set(
        musicLock
          ? allItems
              .filter((item) =>
                findMusicAsset(musicLock, "midi", item.midiPath),
              )
              .map((item) => item.id)
          : [],
      ),
    [allItems, musicLock],
  );
  const [corpus, setCorpus] =
    useState<Awaited<ReturnType<typeof loadHymnSearchCorpus>>>();
  const [corpusError, setCorpusError] = useState<string>();
  const [corpusAttempt, setCorpusAttempt] = useState(0);
  const needsCorpus = Boolean(deferredQuery.trim());
  useEffect(() => {
    if (!needsCorpus) return;
    let active = true;
    setCorpusError(undefined);
    void loadHymnSearchCorpus().then(
      (items) => {
        if (active) setCorpus(items);
      },
      (error) => {
        if (active)
          setCorpusError(
            error instanceof Error ? error.message : "Search unavailable",
          );
      },
    );
    return () => {
      active = false;
    };
  }, [needsCorpus, allItems, corpusAttempt]);
  const searchableItems = useMemo(() => {
    const byId = new Map(corpus?.map((item) => [item.id, item]));
    return allItems.map((item) => byId.get(item.id) ?? item);
  }, [allItems, corpus]);
  const searchIndex = useMemo(
    () => buildHymnSearchIndex(searchableItems),
    [searchableItems],
  );
  const books = useMemo(
    () => [...new Set(allItems.map((item) => item.book))].sort(),
    [allItems],
  );
  const filtered = useMemo(() => {
    if (!deferredQuery.trim() && book === "all")
      return allItems.filter((item) => !item.assetCode);
    return searchHymns(searchIndex, deferredQuery, book);
  }, [allItems, book, deferredQuery, searchIndex]);
  const listRef = useRef<HTMLOListElement>(null);
  const queue = useSyncExternalStore(
    subscribeMidiPlaylist,
    getMidiPlaylist,
    getMidiPlaylist,
  );
  const queueIds = useMemo(
    () => new Set(queue.items.map((entry) => entry.songId)),
    [queue],
  );
  const onRowClick = (
    event: ReactMouseEvent<HTMLButtonElement>,
    songId: string,
  ) => {
    triggerRipple(
      event.currentTarget.closest("li") ?? event.currentTarget,
      event.clientX,
      event.clientY,
    );
    writeHymnViewerMode(pdfMode ? "pdf" : "lyrics");
    void navigateSmooth(navigate, `/kidung/${songId}`);
  };
  const onRowQueue = (
    event: ReactMouseEvent<HTMLButtonElement>,
    item: HymnMetadata,
  ) => {
    event.stopPropagation();
    triggerRipple(event.currentTarget, event.clientX, event.clientY);
    addMidiPlaylistItem({
      songId: item.id,
      title: item.title,
    });
  };
  return (
    <div className="page hymn-page">
      <div className="kidung-index-toolbar">
        <div className="kidung-controls-field">
          <h1 className="sr-only">{translate(locale, "page.kidungTitle")}</h1>
          <KidungLocalNav active="songs" locale={locale} />
          {state.status === "ready" && (
            <div className="kidung-header-filter">
              <Select
                value={book}
                onChange={setBook}
                className="kidung-collection-select"
                animated
                label={translate(locale, "kidung.collection")}
                options={[
                  {
                    value: "all",
                    label: translate(locale, "kidung.allCollections"),
                  },
                  ...books.map((value) => ({
                    value,
                    label: hymnCollectionLabel(value),
                  })),
                ]}
              />
            </div>
          )}
          <div
            role="group"
            aria-label={translate(locale, "kidung.viewMode")}
            className="kidung-mode-control"
          >
            <button
              type="button"
              className="kidung-mode-cycle"
              aria-label={translate(
                locale,
                pdfMode ? "kidung.score" : "kidung.text",
              )}
              aria-pressed={pdfMode}
              title={translate(
                locale,
                pdfMode ? "kidung.score" : "kidung.text",
              )}
              onClick={() => {
                const mode = pdfMode ? "lyrics" : "pdf";
                writeHymnViewerMode(mode);
                setPdfMode(mode === "pdf");
                setSearchParams(
                  (current) => {
                    const next = new URLSearchParams(current);
                    next.delete("mode");
                    return next;
                  },
                  { replace: true },
                );
              }}
            >
              <span
                key={pdfMode ? "pdf" : "lyrics"}
                className="kidung-mode-glyph"
                aria-hidden="true"
              >
                {pdfMode ? (
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Z M14 3v5h5 M8 8h3 M8 11h3 M14 17v-5l3-1" />
                    <ellipse cx="12.5" cy="17.5" rx="1.5" ry="1" />
                  </svg>
                ) : (
                  <span className="hymn-mode-aa">Aa</span>
                )}
              </span>
            </button>
          </div>
        </div>
        <div className="kidung-catalog-topbar">
          <header className="hymn-page-header">
            {state.status === "ready" && (
              <div className="catalog-toolbar hymn-catalog-controls">
                <label className="search-field hymn-search-field">
                  <span className="sr-only">
                    {translate(locale, "kidung.search")}
                  </span>
                  <Icon name="search" size={18} />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={translate(locale, "kidung.searchPlaceholder")}
                  />
                </label>
              </div>
            )}
          </header>
        </div>
      </div>
      {state.status === "loading" && (
        <div className="loading-panel" role="status">
          <LoadingProgress label={translate(locale, "kidung.catalogLoading")} />
        </div>
      )}
      {state.status === "error" && (
        <div className="error-panel" role="alert">
          <strong>{translate(locale, "kidung.catalogUnavailable")}</strong>
          <span>{state.message}</span>
        </div>
      )}
      {state.status === "ready" && (
        <section className="hymn-catalog-shell">
          {needsCorpus && !corpus && !corpusError && (
            <p role="status">{translate(locale, "kidung.catalogLoading")}</p>
          )}
          {needsCorpus && corpusError && (
            <div role="alert">
              <span>{corpusError}</span>
              <button
                type="button"
                onClick={() => setCorpusAttempt((value) => value + 1)}
              >
                {translate(locale, "home.retry")}
              </button>
            </div>
          )}
          <ol className="pujian-list" ref={listRef}>
            {filtered.map((item) => {
              const inQueue = queueIds.has(item.id);
              return (
                <li
                  key={item.id}
                  className="pujian-item"
                  data-id={item.id}
                  data-nomor={String(item.number).toLowerCase()}
                  data-judul={item.title.toLowerCase()}
                >
                  <span className="pujian-nomor" aria-hidden="true">
                    {numberLabel(item.number, item.id)}
                  </span>
                  <button
                    type="button"
                    className="pujian-title"
                    aria-label={item.title}
                    onClick={(event) => onRowClick(event, item.id)}
                  >
                    <span className="pujian-title-label">{item.title}</span>
                  </button>
                  {!item.assetCode && (
                    <button
                      type="button"
                      className={`icon-button add-to-playlist-btn${inQueue ? " in-playlist" : ""}`}
                      data-id={item.id}
                      aria-pressed={inQueue}
                      onClick={(event) => onRowQueue(event, item)}
                      title={translate(
                        locale,
                        inQueue
                          ? "kidung.queueSongExists"
                          : "kidung.queueSongAdd",
                        { title: item.title },
                      )}
                      aria-label={translate(
                        locale,
                        inQueue
                          ? "kidung.queueSongExists"
                          : "kidung.queueSongAdd",
                        { title: item.title },
                      )}
                    >
                      <Icon
                        name={inQueue ? "playlistAddCheck" : "playlistAdd"}
                        size={18}
                      />
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
