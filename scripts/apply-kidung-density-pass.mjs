import { readFileSync, writeFileSync } from "node:fs";

const kidungPath = "apps/web/src/kidung.tsx";
const cssPath = "apps/web/src/kidung-ux.css";

let kidung = readFileSync(kidungPath, "utf8");
let css = readFileSync(cssPath, "utf8");

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(before, first + before.length) >= 0)
    throw new Error(`Ambiguous ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceUntil(source, start, end, replacement, label) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) throw new Error(`Missing start for ${label}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex < 0) throw new Error(`Missing end for ${label}`);
  return source.slice(0, startIndex) + replacement + source.slice(endIndex);
}

kidung = replaceOnce(
  kidung,
  '  const [book, setBook] = useState("all");\n  const deferredQuery = useDeferredValue(query);',
  '  const [book, setBook] = useState("all");\n  const mobileFilterRef = useRef<HTMLDetailsElement>(null);\n  const deferredQuery = useDeferredValue(query);',
  "mobile catalog filter ref",
);

const catalogSelect = `            <Select
              value={book}
              onChange={setBook}
              label={translate(locale, "kidung.collection")}
              options={[
                {
                  value: "all",
                  label: translate(locale, "kidung.allCollections"),
                },
                ...books.map((value) => ({ value, label: value })),
              ]}
            />`;

const catalogFilters = `            <div className="kidung-desktop-filter">
              <Select
                value={book}
                onChange={setBook}
                label={translate(locale, "kidung.collection")}
                options={[
                  {
                    value: "all",
                    label: translate(locale, "kidung.allCollections"),
                  },
                  ...books.map((value) => ({ value, label: value })),
                ]}
              />
            </div>
            <details className="kidung-mobile-filter" ref={mobileFilterRef}>
              <summary
                className="kidung-filter-summary"
                aria-label="Filter koleksi"
              >
                <span>Koleksi</span>
                <strong>
                  {book === "all"
                    ? translate(locale, "kidung.allCollections")
                    : book}
                </strong>
              </summary>
              <div className="kidung-mobile-filter-panel">
                <Select
                  value={book}
                  onChange={(value) => {
                    setBook(value);
                    mobileFilterRef.current?.removeAttribute("open");
                  }}
                  label={translate(locale, "kidung.collection")}
                  options={[
                    {
                      value: "all",
                      label: translate(locale, "kidung.allCollections"),
                    },
                    ...books.map((value) => ({ value, label: value })),
                  ]}
                />
              </div>
            </details>`;

kidung = replaceOnce(
  kidung,
  catalogSelect,
  catalogFilters,
  "responsive catalog filter",
);

const savedActionsStart = `                  <div className="kidung-playlist-actions">
                    {saved.songIds.map`;
const savedActionsEnd = `                  </div>
                </div>
              );`;
const savedActionsReplacement = `                  <div className="kidung-playlist-actions">
                    <details className="kidung-row-menu">
                      <summary
                        aria-label={\`Opsi \${saved.name}\`}
                        title="Opsi playlist"
                      >
                        <Icon name="more" size={18} />
                      </summary>
                      <div className="kidung-row-menu-panel">
                        <button
                          type="button"
                          className="text-button"
                          onClick={(event) => {
                            const name = window.prompt("Ubah nama:", saved.name);
                            if (name?.trim()) renameSavedPlaylist(saved.id, name);
                            event.currentTarget
                              .closest("details")
                              ?.removeAttribute("open");
                          }}
                        >
                          Ubah nama
                        </button>
                        {saved.songIds.length > 0 && (
                          <details className="kidung-manage-saved-items">
                            <summary>Kelola isi · {saved.songIds.length}</summary>
                            <div>
                              {saved.songIds.map((songId) => (
                                <button
                                  key={\`remove-\${songId}\`}
                                  type="button"
                                  className="text-button"
                                  onClick={() =>
                                    removeSongFromPlaylist(saved.id, songId)
                                  }
                                >
                                  Hapus {songId}
                                </button>
                              ))}
                            </div>
                          </details>
                        )}
                        <button
                          type="button"
                          className="text-button kidung-danger-action"
                          onClick={(event) => {
                            deleteSavedPlaylist(saved.id);
                            event.currentTarget
                              .closest("details")
                              ?.removeAttribute("open");
                          }}
                        >
                          Hapus playlist
                        </button>
                      </div>
                    </details>
`;

kidung = replaceUntil(
  kidung,
  savedActionsStart,
  savedActionsEnd,
  savedActionsReplacement,
  "saved playlist contextual actions",
);

const queueActionsStart = `                <div className="kidung-playlist-actions">
                  <button
                    className="text-button"
                    type="button"
                    aria-label={\`Naikkan \${item.title}\`}`;
const queueActionsEnd = `                </div>
              </li>`;
const queueActionsReplacement = `                <div className="kidung-playlist-actions">
                  <details className="kidung-row-menu">
                    <summary
                      aria-label={\`Opsi \${item.title}\`}
                      title="Opsi lagu"
                    >
                      <Icon name="more" size={18} />
                    </summary>
                    <div className="kidung-row-menu-panel">
                      <button
                        className="text-button"
                        type="button"
                        aria-label={\`Naikkan \${item.title}\`}
                        onClick={() => moveMidiPlaylistItem(index, index - 1)}
                        disabled={index === 0}
                      >
                        Naikkan
                      </button>
                      <button
                        className="text-button"
                        type="button"
                        aria-label={\`Turunkan \${item.title}\`}
                        onClick={() => moveMidiPlaylistItem(index, index + 1)}
                        disabled={index === playlist.items.length - 1}
                      >
                        Turunkan
                      </button>
                      <button
                        className="text-button kidung-open-song"
                        type="button"
                        onClick={() => navigate(\`/kidung/\${item.songId}\`)}
                      >
                        Buka kidung
                      </button>
                      <button
                        className="text-button kidung-danger-action"
                        type="button"
                        aria-label={\`Hapus \${item.title} dari playlist\`}
                        onClick={() => removeMidiPlaylistItem(item.songId)}
                      >
                        Hapus dari playlist
                      </button>
                    </div>
                  </details>
`;

kidung = replaceUntil(
  kidung,
  queueActionsStart,
  queueActionsEnd,
  queueActionsReplacement,
  "queue contextual actions",
);

const detailNeighbors = `        <div className="detail-neighbors">
          <button
            type="button"
            className="quiet-button detail-neighbor-button"
            disabled={!prev}
            onClick={() => goToNeighbor(prev)}
            aria-label={translate(locale, "kidung.previous")}
            title={translate(locale, "kidung.previous")}
          >
            <Icon name="chevronLeft" size={18} />
            <span className="control-copy">
              {translate(locale, "kidung.previous")}
            </span>
          </button>
          <button
            type="button"
            className="quiet-button detail-neighbor-button"
            disabled={!next}
            onClick={() => goToNeighbor(next)}
            aria-label={translate(locale, "kidung.next")}
            title={translate(locale, "kidung.next")}
          >
            <span className="control-copy">
              {translate(locale, "kidung.next")}
            </span>
            <Icon name="chevronRight" size={18} />
          </button>
        </div>
`;

kidung = replaceOnce(
  kidung,
  detailNeighbors,
  "",
  "duplicate detail hero navigation",
);

const pdfNavStart = `              <button
                type="button"
                className="viewer-chrome-button"
                disabled={!prev}
                onClick={() => goToNeighbor(prev)}
                aria-label={translate(locale, "kidung.previous")}`;
const pdfChordEditorStart = `              {chordEditorEnabled && (`;
const pdfCompactChrome = `              <div
                className="hymn-pdf-viewer-title"
                id="pdf-viewer-title-wrapper"
                ref={overlayTitleRef}
                onClick={handleTitleTap}
                title="Klik 5x untuk mengaktifkan mode edit chord"
              >
                <strong id="pdf-viewer-title">{item.title}</strong>
                <small id="pdf-viewer-number">
                  No. {numberLabel(item.number)}
                </small>
              </div>
              <details className="pdf-music-menu" name="hymn-pdf-toolbar-menu">
                <summary
                  className="viewer-chrome-button pdf-music-summary"
                  aria-label="Opsi musik"
                  title="Opsi musik"
                >
                  <span aria-hidden="true">
                    <Icon name="music" size={18} />
                  </span>
                  <span className="viewer-chrome-copy">
                    {!item.assetCode && chordsVisible
                      ? \`\${renderedKey}\${
                          transpose === 0
                            ? ""
                            : \` · \${transpose > 0 ? \`+\${transpose}\` : transpose}\`
                        }\`
                      : "Musik"}
                  </span>
                </summary>
                <div className="pdf-music-menu-panel">
                  {midiAvailable && (
                    <button
                      type="button"
                      className="quiet-button pdf-music-action"
                      aria-expanded={midiDockOpen}
                      onClick={() => {
                        if (midiState.songId !== item.id) {
                          void loadMidi().then(() => setMidiDockOpen(true));
                        } else {
                          setMidiDockOpen((open) => !open);
                        }
                      }}
                      disabled={
                        midiStatus === "loading" ||
                        midiState.status === "loading"
                      }
                    >
                      <Icon name="music" size={17} />
                      <span>{midiDockOpen ? "Tutup MIDI" : "Buka MIDI"}</span>
                    </button>
                  )}
                  {!item.assetCode && (
                    <button
                      type="button"
                      className="quiet-button pdf-music-action"
                      onClick={toggleChords}
                      disabled={chordStatus === "loading"}
                      aria-pressed={chordsVisible}
                    >
                      <Icon name="music" size={17} />
                      <span>
                        {chordStatus === "loading"
                          ? "Memuat chord…"
                          : chordsVisible
                            ? "Sembunyikan chord"
                            : "Tampilkan chord"}
                      </span>
                    </button>
                  )}
                  {!item.assetCode && (
                    <div
                      className="pdf-transpose-inline"
                      role="group"
                      aria-label="Transpose PDF"
                    >
                      <div className="pdf-key-control">
                        <button
                          type="button"
                          className="viewer-chrome-button pdf-key-btn"
                          onClick={() => setPdfKeyMenuOpen((open) => !open)}
                          aria-expanded={pdfKeyMenuOpen}
                          aria-haspopup="listbox"
                          aria-label="Pilih nada dasar"
                          title="Pilih nada dasar"
                        >
                          {chordKeyName(keyIndex, accidental)}
                        </button>
                        {pdfKeyMenuOpen && (
                          <div
                            className="pdf-key-dropdown"
                            role="listbox"
                            aria-label="Nada dasar"
                          >
                            {Array.from({ length: 12 }, (_, value) => (
                              <button
                                key={value}
                                type="button"
                                role="option"
                                aria-selected={value === keyIndex}
                                className={
                                  value === keyIndex ? "is-selected" : undefined
                                }
                                onClick={() => {
                                  setKeyIndex(value);
                                  updateTranspose(
                                    transposeBetweenKeys(sourceKeyIndex, value),
                                  );
                                  setPdfKeyMenuOpen(false);
                                }}
                              >
                                {chordKeyName(value, accidental)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="viewer-chrome-button pdf-accidental-btn"
                        onClick={() =>
                          setAccidental((current) =>
                            current === "sharp" ? "flat" : "sharp",
                          )
                        }
                        aria-pressed={accidental === "flat"}
                        aria-label="Ganti notasi kres/mol"
                        title={
                          accidental === "sharp"
                            ? "Notasi kres (♯)"
                            : "Notasi mol (♭)"
                        }
                      >
                        {accidental === "sharp" ? "♯" : "♭"}
                      </button>
                      <div className="pdf-transpose-btns">
                        <button
                          type="button"
                          className="viewer-chrome-button"
                          onClick={() => updateTranspose(transpose - 1)}
                          aria-label={translate(locale, "kidung.transposeDown")}
                        >
                          −
                        </button>
                        <strong>
                          {transpose > 0 ? \`+\${transpose}\` : transpose}
                        </strong>
                        <button
                          type="button"
                          className="viewer-chrome-button"
                          onClick={() => updateTranspose(transpose + 1)}
                          aria-label={translate(locale, "kidung.transposeUp")}
                        >
                          +
                        </button>
                        {transpose !== 0 && (
                          <button
                            type="button"
                            className="viewer-chrome-button pdf-transpose-reset"
                            onClick={() => updateTranspose(0)}
                            title="Reset Transpose"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </details>
              {midiAvailable && midiDockOpen && (
                <div
                  className="hymn-midi-dock pdf-midi-dock-context"
                  role="group"
                  aria-label="Pemutar MIDI"
                >
                  <MidiControlsPanel locale={locale} />
                </div>
              )}
`;

kidung = replaceUntil(
  kidung,
  pdfNavStart,
  pdfChordEditorStart,
  pdfCompactChrome,
  "compact PDF navigation and music menu",
);

const oldPdfChordStart = `              {!item.assetCode && (
                <button
                  type="button"
                  className="viewer-chrome-button viewer-chrome-chord"`;
const pdfChromeEnd = `            </div>
            {pdfStatus === "loading"`;
kidung = replaceUntil(
  kidung,
  oldPdfChordStart,
  pdfChromeEnd,
  "",
  "old PDF chord and transpose chrome",
);

const fullscreenActionStart = `            <button
              type="button"
              className="quiet-button hymn-action"
              onClick={() => setLyricsPanelOpen(true)}`;
const segmentedToolbarStart = `          </div>

          <div className="hymn-segmented-toolbar">`;
kidung = replaceUntil(
  kidung,
  fullscreenActionStart,
  segmentedToolbarStart,
  "",
  "redundant text reader fullscreen and PDF actions",
);

const morePanelStart = `            <div className="hymn-more-actions-panel">
              <button`;
const morePanelWithLyrics = `            <div className="hymn-more-actions-panel">
              <button
                type="button"
                className="quiet-button hymn-action"
                onClick={() => setLyricsPanelOpen(true)}
                aria-label="Mode lirik layar penuh"
              >
                <span className="hymn-action-icon" aria-hidden="true">
                  <Icon name="menuBook" size={17} />
                </span>
                <span className="hymn-action-label">Lirik layar penuh</span>
              </button>
              <button`;
kidung = replaceOnce(
  kidung,
  morePanelStart,
  morePanelWithLyrics,
  "fullscreen lyrics action in More menu",
);

const densityCss = `

/* Compact Kidung navigation pass: keep the primary surface calm and move
   low-frequency controls into contextual menus without removing capability. */
.kidung-mobile-filter {
  display: none;
  position: relative;
}

.kidung-desktop-filter {
  min-width: 0;
}

.kidung-filter-summary,
.kidung-row-menu > summary,
.pdf-music-menu > summary {
  list-style: none;
  cursor: pointer;
}

.kidung-filter-summary::-webkit-details-marker,
.kidung-row-menu > summary::-webkit-details-marker,
.pdf-music-menu > summary::-webkit-details-marker {
  display: none;
}

.kidung-filter-summary {
  min-height: var(--control-hit, 44px);
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--muted);
  transition:
    border-color var(--motion-fast) var(--ease-out),
    background-color var(--motion-fast) var(--ease-out),
    color var(--motion-fast) var(--ease-out),
    transform var(--motion-fast) var(--ease-out);
}

.kidung-filter-summary strong {
  max-width: 180px;
  overflow: hidden;
  color: var(--ink);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kidung-mobile-filter[open] > .kidung-filter-summary,
.kidung-filter-summary:hover,
.kidung-filter-summary:focus-visible {
  border-color: color-mix(in srgb, var(--blue) 40%, var(--line));
  background: var(--blue-soft);
  color: var(--blue);
}

.kidung-filter-summary:focus-visible,
.kidung-row-menu > summary:focus-visible,
.pdf-music-menu > summary:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--blue) 45%, transparent);
  outline-offset: 3px;
}

.kidung-mobile-filter-panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: var(--z-popover);
  width: min(320px, calc(100vw - 32px));
  padding: 10px;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-lift);
  animation: kidung-sheet-in var(--motion-fast) var(--ease-out) both;
}

.kidung-playlist-list > li,
.kidung-saved-playlist-row {
  position: relative;
  overflow: visible;
}

.kidung-playlist-actions {
  position: relative;
  flex: 0 0 auto;
}

.kidung-row-menu {
  position: relative;
}

.kidung-row-menu > summary {
  display: grid;
  width: 44px;
  min-width: 44px;
  height: 44px;
  min-height: 44px;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--muted);
  transition:
    border-color var(--motion-fast) var(--ease-out),
    background-color var(--motion-fast) var(--ease-out),
    color var(--motion-fast) var(--ease-out),
    transform var(--motion-fast) var(--ease-out);
}

.kidung-row-menu[open] > summary,
.kidung-row-menu > summary:hover,
.kidung-row-menu > summary:focus-visible {
  border-color: color-mix(in srgb, var(--blue) 40%, var(--line));
  background: var(--blue-soft);
  color: var(--blue);
}

.kidung-row-menu > summary:active {
  transform: scale(0.96);
}

.kidung-row-menu-panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: var(--z-popover);
  display: grid;
  width: min(260px, calc(100vw - 32px));
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-lift);
  animation: kidung-sheet-in var(--motion-fast) var(--ease-out) both;
}

.kidung-row-menu-panel > button,
.kidung-manage-saved-items button {
  min-height: 42px;
  width: 100%;
  justify-content: flex-start;
  padding-inline: 10px;
  text-align: left;
}

.kidung-danger-action {
  color: #a84545;
}

.kidung-manage-saved-items {
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.kidung-manage-saved-items > summary {
  min-height: 42px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  color: var(--muted);
  cursor: pointer;
}

.kidung-manage-saved-items > div {
  display: grid;
  gap: 3px;
  max-height: 220px;
  overflow: auto;
  padding-bottom: 6px;
}

.hymn-detail-page .detail-hero {
  grid-template-columns: minmax(0, 1fr) auto;
}

.hymn-pdf-viewer-chrome {
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.pdf-music-menu {
  position: relative;
  min-width: 0;
}

.pdf-music-summary {
  min-width: 44px;
  gap: 6px;
}

.pdf-music-menu-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: var(--z-popover);
  display: grid;
  width: min(360px, calc(100vw - 32px));
  max-height: min(70dvh, 560px);
  gap: 8px;
  overflow: auto;
  padding: 12px;
  border: 1px solid var(--line-strong);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: var(--shadow-lift);
  animation: kidung-sheet-in var(--motion-fast) var(--ease-out) both;
}

.pdf-music-action {
  min-height: 44px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding-inline: 10px;
}

.pdf-music-menu .pdf-transpose-inline {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  width: 100%;
  padding-top: 8px;
  border-top: 1px solid var(--line);
}

.pdf-music-menu .pdf-transpose-btns {
  grid-column: 1 / -1;
  justify-self: stretch;
}

.pdf-midi-dock-context {
  grid-column: 1 / -1;
}

@media (max-width: 767px) {
  .kidung-desktop-filter {
    display: none;
  }

  .kidung-mobile-filter {
    display: block;
    justify-self: end;
  }

  .hymn-page-header .hymn-catalog-controls {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .hymn-catalog-controls .search-field {
    grid-column: 1 / -1;
  }

  .hymn-text-toolbar .detail-actions {
    grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
  }

  .kidung-row-menu-panel,
  .pdf-music-menu-panel {
    position: fixed;
    top: auto;
    right: 12px;
    bottom: max(12px, env(safe-area-inset-bottom));
    left: 12px;
    z-index: calc(var(--z-modal) - 1);
    width: auto;
    max-height: min(72dvh, 620px);
    border-radius: 16px;
    animation: kidung-sheet-in var(--motion-normal) var(--ease-out) both;
  }

  .hymn-pdf-viewer-chrome {
    grid-template-columns: 44px minmax(0, 1fr) auto;
    gap: 4px;
  }

  .pdf-music-summary .viewer-chrome-copy {
    display: none;
  }
}

@media (min-width: 768px) {
  .kidung-desktop-filter {
    display: block;
  }
}

@media (prefers-reduced-motion: reduce) {
  .kidung-filter-summary,
  .kidung-mobile-filter-panel,
  .kidung-row-menu > summary,
  .kidung-row-menu-panel,
  .pdf-music-menu-panel {
    transition: none;
    animation: none;
    transform: none;
  }
}
`;

if (css.includes("/* Compact Kidung navigation pass:"))
  throw new Error("Kidung density CSS already applied");
css += densityCss;

writeFileSync(kidungPath, kidung);
writeFileSync(cssPath, css);
