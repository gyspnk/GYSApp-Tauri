import { LoadingProgress } from "./loading-progress.js";
import { useReadinessMarker } from "./readiness.js";
import {
  useCallback,
  useEffect,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { type HymnMetadata, type UpstreamMusicLock } from "@gys/contracts";
import { translate, type Locale } from "./i18n.js";
import { recordDiagnostic } from "./diagnostics.js";
import { Icon } from "./icons.js";
import { triggerRipple } from "./ripple.js";
import { buildHymnSearchIndex, searchHymns } from "./hymn-search.js";
import {
  addMidiPlaylistItem,
  getMidiPlaylist,
  removeMidiPlaylistItem,
  subscribeMidiPlaylist,
} from "./midi-playlist.js";
import { midiPlayer } from "./midi-player.js";
import {
  type CatalogState,
  numberLabel,
  hymnCollectionLabel,
  uniqueItems,
} from "./kidung-shared.js";
import {
  readStoredCollection,
  writeStoredCollection,
} from "./kidung-collection-store.js";
import { Select } from "./select.js";
import { loadHymnSearchCorpus } from "./hymn-search-corpus.js";
import { KidungLocalNav } from "./kidung-local-nav.js";
import { readHymnViewerMode, writeHymnViewerMode } from "./hymn-view-mode.js";
import { navigateSmooth } from "./route-transitions.js";

export function HymnCatalog({
  locale,
  state,
  onRetry,
}: {
  locale: Locale;
  state: CatalogState<HymnMetadata>;
  musicLock?: UpstreamMusicLock;
  onRetry?: () => void;
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
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [staggering, setStaggering] = useState(false);
  const hasRows = state.status === "ready" && state.items.length > 0;
  useEffect(() => {
    if (!hasRows) return;
    setStaggering(true);
    const timer = window.setTimeout(() => setStaggering(false), 760);
    return () => {
      window.clearTimeout(timer);
      setStaggering(false);
    };
  }, [hasRows]);
  const [book, setBookState] = useState(readStoredCollection);
  const setBook = useCallback((next: string) => {
    setBookState(next);
    writeStoredCollection(next);
  }, []);
  const deferredQuery = useDeferredValue(query);
  const allItems = useMemo(
    () => (state.status === "ready" ? uniqueItems(state.items) : []),
    [state],
  );
  const [corpus, setCorpus] =
    useState<Awaited<ReturnType<typeof loadHymnSearchCorpus>>>();
  const [corpusError, setCorpusError] = useState<string>();
  const [corpusAttempt, setCorpusAttempt] = useState(0);
  useEffect(() => {
    if (state.status === "error")
      recordDiagnostic(
        "warn",
        "kidung.catalog.error",
        new Error(state.message),
      );
  }, [state]);
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
        if (!active) return;
        recordDiagnostic("warn", "kidung.search.error", error);
        setCorpusError(translate(locale, "common.errorBody"));
      },
    );
    return () => {
      active = false;
    };
  }, [needsCorpus, allItems, corpusAttempt, locale]);
  const searchableItems = useMemo(() => {
    if (!corpus) return allItems;
    const byId = new Map(corpus.map((item) => [item.id, item]));
    return allItems.map((item) => byId.get(item.id) ?? item);
  }, [allItems, corpus]);
  const searchIndex = useMemo(
    () => (deferredQuery.trim() ? buildHymnSearchIndex(searchableItems) : null),
    [deferredQuery, searchableItems],
  );
  const books = useMemo(
    () => [...new Set(allItems.map((item) => item.book))].sort(),
    [allItems],
  );
  const activeBook = useMemo(() => {
    if (book && books.some((entry) => entry === book)) return book;
    return (
      books.find((entry) => hymnCollectionLabel(entry) === "KR") ??
      books[0] ??
      ""
    );
  }, [book, books]);
  const filtered = useMemo(() => {
    if (searchIndex) return searchHymns(searchIndex, deferredQuery, activeBook);
    return allItems
      .filter((item) => item.book === activeBook)
      .sort((a, b) => a.number - b.number);
  }, [activeBook, allItems, deferredQuery, searchIndex]);
  useEffect(() => {
    performance.mark("gys-kidung-catalog-mounted");
    const frame = window.requestAnimationFrame(() => {
      performance.mark("gys-kidung-catalog-painted");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const listRef = useRef<HTMLOListElement>(null);
  const queue = useSyncExternalStore(
    subscribeMidiPlaylist,
    getMidiPlaylist,
    getMidiPlaylist,
  );
  const playerState = useSyncExternalStore(
    midiPlayer.subscribe,
    midiPlayer.snapshot,
    midiPlayer.snapshot,
  );
  const queueIds = useMemo(
    () => new Set(queue.items.map((entry) => entry.songId)),
    [queue],
  );
  const warmRow = useCallback((songId: string) => {
    void import("./route-preload.js")
      .then((module) => module.preloadRoute(`/kidung/${songId}`))
      .catch(() => undefined);
  }, []);
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
    inQueue: boolean,
  ) => {
    event.stopPropagation();
    triggerRipple(event.currentTarget, event.clientX, event.clientY);
    if (inQueue) {
      removeMidiPlaylistItem(item.id);
    } else {
      addMidiPlaylistItem({
        songId: item.id,
        title: item.title,
      });
    }
  };
  return (
    <div className="page hymn-page">
      <h1 className="sr-only">{translate(locale, "page.kidungTitle")}</h1>
      <div
        className={`kidung-index-toolbar${filtersCollapsed ? " is-collapsed" : ""}`}
      >
        <div className="kidung-controls-field">
          <button
            type="button"
            className="kidung-toolbar-collapse"
            aria-expanded={!filtersCollapsed}
            aria-controls="kidung-toolbar-filters"
            onClick={() => setFiltersCollapsed((value) => !value)}
          >
            <Icon name="chevronLeft" size={18} />
            <span className="sr-only">
              {translate(
                locale,
                filtersCollapsed ? "kidung.showFilters" : "kidung.hideFilters",
              )}
            </span>
          </button>
          <KidungLocalNav active="songs" locale={locale} />
          {state.status === "ready" && (
            <div id="kidung-toolbar-filters" className="kidung-header-filter">
              <Select
                value={activeBook}
                onChange={setBook}
                className="kidung-collection-select"
                animated
                label={translate(locale, "kidung.collection")}
                options={books.map((value) => ({
                  value,
                  label: hymnCollectionLabel(value),
                }))}
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
                pdfMode ? "kidung.showText" : "kidung.showScore",
              )}
              aria-pressed={pdfMode}
              title={translate(
                locale,
                pdfMode ? "kidung.showText" : "kidung.showScore",
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
          <span>{translate(locale, "common.errorBody")}</span>
          {onRetry && (
            <button className="primary-button" type="button" onClick={onRetry}>
              {translate(locale, "home.retry")}
            </button>
          )}
        </div>
      )}
      {state.status === "ready" && (
        <section className="hymn-catalog-shell">
          <div className="kidung-catalog-summary">
            <div className="kidung-catalog-summary-info">
              <span className="kidung-catalog-book-pill">
                <Icon name="musicNote" size={14} />
                <span>{hymnCollectionLabel(activeBook)}</span>
              </span>
              <span className="kidung-catalog-count">
                {translate(locale, "kidung.settingsSongCount", {
                  count: filtered.length,
                })}
              </span>
              <span className="kidung-catalog-mode-pill">
                {translate(
                  locale,
                  pdfMode ? "kidung.showScore" : "kidung.showText",
                )}
              </span>
            </div>
            {queue.items.length > 0 && (
              <Link
                className="kidung-catalog-queue-pill"
                to="/kidung?section=playlist"
                onClick={(event) => {
                  event.preventDefault();
                  void navigateSmooth(navigate, "/kidung?section=playlist");
                }}
              >
                <Icon name="queueMusic" size={15} />
                <span>
                  {translate(locale, "kidung.playlist")} ({queue.items.length})
                </span>
              </Link>
            )}
          </div>
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
          {filtered.length === 0 &&
            (!needsCorpus || Boolean(corpus) || Boolean(corpusError)) && (
              <div className="empty-state kidung-search-empty" role="status">
                <strong>{translate(locale, "kidung.searchEmptyTitle")}</strong>
                <span>{translate(locale, "kidung.searchEmptyBody")}</span>
                {query.trim().length > 0 && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setQuery("")}
                  >
                    {translate(locale, "catalog.reset")}
                  </button>
                )}
              </div>
            )}
          <ol
            className={`pujian-list${staggering ? " is-staggering" : ""}`}
            ref={listRef}
          >
            {filtered.map((item, index) => {
              const inQueue = queueIds.has(item.id);
              const isPlaying =
                playerState.songId === item.id &&
                playerState.status === "playing";
              return (
                <li
                  key={item.id}
                  className={`pujian-item${inQueue ? " is-queued" : ""}${isPlaying ? " is-now-playing" : ""}`}
                  data-id={item.id}
                  data-nomor={String(item.number).toLowerCase()}
                  data-judul={item.title.toLowerCase()}
                  style={
                    { "--row-index": Math.min(index, 59) } as CSSProperties
                  }
                >
                  <span className="pujian-nomor" aria-hidden="true">
                    {numberLabel(item.number, item.id)}
                  </span>
                  <button
                    type="button"
                    className="pujian-title"
                    aria-label={item.title}
                    onClick={(event) => onRowClick(event, item.id)}
                    onPointerEnter={() => warmRow(item.id)}
                    onFocus={() => warmRow(item.id)}
                  >
                    <span className="pujian-title-label">{item.title}</span>
                  </button>
                  {!item.assetCode && (
                    <button
                      type="button"
                      className={`icon-button add-to-playlist-btn${inQueue ? " in-playlist" : ""}`}
                      data-id={item.id}
                      aria-pressed={inQueue}
                      onClick={(event) => onRowQueue(event, item, inQueue)}
                      title={translate(
                        locale,
                        inQueue
                          ? "kidung.removeFromPlaylist"
                          : "kidung.queueSongAdd",
                        { title: item.title },
                      )}
                      aria-label={translate(
                        locale,
                        inQueue
                          ? "kidung.removeSongFromPlaylist"
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
