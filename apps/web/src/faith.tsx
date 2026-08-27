import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { translate, type Locale } from "./i18n.js";

type FaithItem = { number: string; text: string };
type FaithGroup = { language: string; title: string; content: FaithItem[] };
type FaithPack = { faith: FaithGroup[] };
type FaithPdfProgress = {
  page: number;
  totalPages: number;
  percent: number;
  lastOpenedAt: string;
};

const FaithPdfReader = lazy(() =>
  import("./pdf.js").then(({ PdfReader: Component }) => ({
    default: Component,
  })),
);

/**
 * “Baca lebih lanjut” opens the matching TJC Dasar Kepercayaan doctrine PDF
 * (sumber resmi tjc.org), dirender dengan viewer PDF yang sama seperti
 * Literatur — bukan teks mentah.
 */
const DK_READ_MORE = new Map<string, { pdf: string; source: string }>([
  [
    "1",
    {
      pdf: "https://tjc.org/id/wp-content/uploads/sites/43/2019/10/Yesus-Kristus.pdf",
      source: "https://tjc.org/id/dasar-kepercayaan/dk-yesus-kristus/",
    },
  ],
  [
    "2",
    {
      pdf: "https://tjc.org/id/wp-content/uploads/sites/43/2019/10/Alkitab.pdf",
      source: "https://tjc.org/id/dasar-kepercayaan/dk-alkitab/",
    },
  ],
  [
    "3",
    {
      pdf: "https://tjc.org/id/wp-content/uploads/sites/43/2019/10/Gereja.pdf",
      source: "https://tjc.org/id/dasar-kepercayaan/dk-gereja/",
    },
  ],
  [
    "4",
    {
      pdf: "https://tjc.org/id/wp-content/uploads/sites/43/2019/10/Baptisan.pdf",
      source: "https://tjc.org/id/dasar-kepercayaan/dk-baptisan/",
    },
  ],
  [
    "5",
    {
      pdf: "https://tjc.org/id/wp-content/uploads/sites/43/2019/10/Roh-Kudus.pdf",
      source: "https://tjc.org/id/dasar-kepercayaan/dk-rohkudus/",
    },
  ],
  [
    "6",
    {
      pdf: "https://tjc.org/id/wp-content/uploads/sites/43/2019/10/Basuh-Kaki.pdf",
      source: "https://tjc.org/id/dasar-kepercayaan/dk-basuhkaki/",
    },
  ],
  [
    "7",
    {
      pdf: "https://tjc.org/id/wp-content/uploads/sites/43/2019/10/Perjamuan-Kudus.pdf",
      source: "https://tjc.org/id/dasar-kepercayaan/dk-pk/",
    },
  ],
  [
    "8",
    {
      pdf: "https://tjc.org/id/wp-content/uploads/sites/43/2019/10/Hari-Sabat.pdf",
      source: "https://tjc.org/id/dasar-kepercayaan/dk-sabat/",
    },
  ],
  [
    "9",
    {
      pdf: "https://tjc.org/id/wp-content/uploads/sites/43/2019/10/Keselamatan.pdf",
      source: "https://tjc.org/id/dasar-kepercayaan/dk-keselamatan/",
    },
  ],
  [
    "10",
    {
      pdf: "https://tjc.org/id/wp-content/uploads/sites/43/2019/10/Kedatangan-Kristus.pdf",
      source: "https://tjc.org/id/dasar-kepercayaan/dk-kedatangan-kristus/",
    },
  ],
]);

function faithPdfUrl(sourceUrl: string): string {
  const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
  return base
    ? `${base.replace(/\/$/, "")}/api/v1/content/pdf?url=${encodeURIComponent(sourceUrl)}`
    : sourceUrl;
}

const PDF_PROGRESS_PREFIX = "gys-faith-pdf-";

function readFaithPdfProgress(number: string): FaithPdfProgress | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(`${PDF_PROGRESS_PREFIX}${number}`);
    if (!raw) return undefined;
    const value: unknown = JSON.parse(raw);
    if (
      value &&
      typeof value === "object" &&
      typeof (value as { page?: unknown }).page === "number" &&
      typeof (value as { totalPages?: unknown }).totalPages === "number" &&
      typeof (value as { percent?: unknown }).percent === "number"
    ) {
      const progress = value as FaithPdfProgress;
      return progress.percent > 0 && progress.page > 0 ? progress : undefined;
    }
  } catch {
    // ignore corrupt storage
  }
  return undefined;
}

function writeFaithPdfProgress(
  number: string,
  progress: FaithPdfProgress,
): void {
  try {
    window.localStorage.setItem(
      `${PDF_PROGRESS_PREFIX}${number}`,
      JSON.stringify(progress),
    );
  } catch {
    // ignore quota/private mode
  }
}

function isFaithPack(value: unknown): value is FaithPack {
  if (!value || typeof value !== "object") return false;
  const faith = (value as { faith?: unknown }).faith;
  return (
    Array.isArray(faith) &&
    faith.length > 0 &&
    faith.every(
      (group) =>
        group &&
        typeof group === "object" &&
        typeof (group as { language?: unknown }).language === "string" &&
        Array.isArray((group as { content?: unknown }).content),
    )
  );
}

export function FaithPage({ locale }: { locale: Locale }) {
  const [searchParams] = useSearchParams();
  const [pack, setPack] = useState<FaithPack | undefined>();
  const [query, setQuery] = useState("");
  // Seperti Alkitab: tidak ada seleksi otomatis — user memilih sendiri.
  const [selected, setSelected] = useState<string>(
    () => searchParams.get("item") ?? "",
  );
  const [notePopupOpen, setNotePopupOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [pdfRead, setPdfRead] = useState<
    { number: string; title: string; url: string } | undefined
  >(undefined);
  const [pdfProgress, setPdfProgress] = useState<FaithPdfProgress | undefined>(
    undefined,
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${import.meta.env.BASE_URL}offline/faith.json`, {
      signal: controller.signal,
      cache: "force-cache",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Faith pack unavailable");
        const json: unknown = await response.json();
        if (!isFaithPack(json)) throw new Error("Faith pack is invalid");
        setPack(json);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPack({ faith: [] });
      });
    return () => controller.abort();
  }, []);

  const group =
    pack?.faith.find(
      (candidate) => candidate.language === locale.toUpperCase(),
    ) ?? pack?.faith[0];
  const items = group?.content ?? [];
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return items.filter(
      (item) =>
        !normalized ||
        `${item.number} ${item.text}`.toLocaleLowerCase().includes(normalized),
    );
  }, [items, query]);
  const active = items.find((item) => item.number === selected);

  const noteKey = (number: string) => `gys-faith-note-${number}`;
  const savedNotes = useMemo(
    () =>
      items
        .map((item) => ({
          item,
          text: localStorage.getItem(noteKey(item.number)) ?? "",
        }))
        .filter((entry) => Boolean(entry.text.trim())),
    [items],
  );
  const hasNote = (number: string) =>
    Boolean(localStorage.getItem(noteKey(number))?.trim());

  // Klik pokok yang sama lagi → deselect (persis pola ayat di Alkitab).
  const toggleSelected = (number: string) => {
    setSelected((current) => (current === number ? "" : number));
  };

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  };
  const share = async () => {
    if (!active) return;
    const title = group?.title ?? "Iman";
    const text = `${title} ${active.number}\n${active.text}`;
    try {
      if (navigator.share) await navigator.share({ title, text });
      else {
        await navigator.clipboard?.writeText(text);
        flash(translate(locale, "faith.shareDone"));
      }
    } catch {
      flash(translate(locale, "faith.shareCancelled"));
    }
  };
  const copySection = async () => {
    if (!active) return;
    await navigator.clipboard?.writeText(
      `${group?.title ?? "Iman"} ${active.number}\n${active.text}`,
    );
    flash(translate(locale, "faith.copyDone"));
  };

  const openNote = () => {
    if (!active) return;
    setNoteDraft(localStorage.getItem(noteKey(active.number)) ?? "");
    setNotePopupOpen(true);
  };
  const saveNote = () => {
    if (!active) return;
    localStorage.setItem(noteKey(active.number), noteDraft.trim());
    flash(translate(locale, "faith.noteSaved"));
    setNotePopupOpen(false);
  };
  const deleteNote = (number: string) => {
    localStorage.removeItem(noteKey(number));
    if (active?.number === number) setNoteDraft("");
  };
  const openOtherNote = (number: string) => {
    setSelected(number);
    const item = items.find((candidate) => candidate.number === number);
    setNoteDraft(localStorage.getItem(noteKey(number)) ?? "");
    if (item) setNotePopupOpen(true);
  };

  const openReadMore = () => {
    if (!active) return;
    const entry = DK_READ_MORE.get(active.number);
    if (!entry) return;
    setPdfProgress(readFaithPdfProgress(active.number));
    setPdfRead({
      number: active.number,
      title: `${active.text.split(/[.!?]/)[0] ?? active.text} (PDF)`,
      url: entry.pdf,
    });
  };
  const closeReadMore = () => {
    setPdfRead(undefined);
    setPdfProgress(undefined);
  };

  const onPageChange = (page: number, totalPages: number) => {
    if (!pdfRead || totalPages < 1) return;
    const next: FaithPdfProgress = {
      page,
      totalPages,
      percent: Math.max(
        0,
        Math.min(100, Math.round((page / totalPages) * 100)),
      ),
      lastOpenedAt: new Date().toISOString(),
    };
    writeFaithPdfProgress(pdfRead.number, next);
    setPdfProgress(next);
  };

  return (
    <div className="page faith-page">
      <section className="page-intro">
        <div>
          <p className="date-line">{translate(locale, "faith.packLabel")}</p>
          <h1>{translate(locale, "page.imanTitle")}</h1>
          <p className="intro-copy">{translate(locale, "page.imanBody")}</p>
        </div>
        <span className="pack-badge">ID · EN · 中文</span>
      </section>
      {!pack && (
        <div className="loading-panel" role="status">
          {translate(locale, "faith.loading")}
        </div>
      )}
      {pack && !group && (
        <div className="error-panel" role="alert">
          {translate(locale, "faith.unavailable")}
        </div>
      )}
      {group && (
        <section className="faith-stack" aria-label={group.title}>
          <div className="faith-stack-toolbar">
            <label htmlFor="faith-query">
              {translate(locale, "faith.search")}
            </label>
            <input
              id="faith-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={translate(locale, "faith.searchPlaceholder")}
            />
            <span>
              {translate(locale, "faith.count", { count: filtered.length })}
            </span>
          </div>
          <div
            className="faith-rows"
            role="list"
            aria-label={translate(locale, "faith.list")}
          >
            {filtered.map((item) => {
              const isActive = item.number === active?.number;
              const note = hasNote(item.number);
              const progress = readFaithPdfProgress(item.number);
              return (
                <div role="listitem" key={item.number}>
                  <button
                    className={`faith-row-heading${isActive ? " is-selected" : ""}${note ? " has-note" : ""}`}
                    type="button"
                    onClick={() => toggleSelected(item.number)}
                    aria-pressed={isActive}
                    aria-haspopup="dialog"
                  >
                    <span className="faith-number">
                      {item.number.padStart(2, "0")}
                    </span>
                    <strong>{item.text.split(/[.!?]/)[0]}</strong>
                    {note && <span className="faith-row-note-dot">✎</span>}
                    {progress && (
                      <span
                        className="faith-row-progress"
                        title={`Progres ${progress.percent}%`}
                      >
                        {progress.percent}%
                      </span>
                    )}
                    <span aria-hidden="true">{isActive ? "•" : "›"}</span>
                  </button>
                </div>
              );
            })}
          </div>

          {active &&
            createPortal(
              <div
                className="faith-modal-backdrop"
                role="dialog"
                aria-modal="true"
                aria-label={translate(locale, "faith.topic", {
                  number: active.number,
                })}
                onClick={() => setSelected("")}
              >
                <div
                  className="faith-modal"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="faith-modal-header">
                    <span className="faith-selection-number">
                      {active.number.padStart(2, "0")}
                    </span>
                    <strong>
                      {translate(locale, "faith.topic", {
                        number: active.number,
                      })}
                    </strong>
                    <button
                      className="faith-selection-close"
                      type="button"
                      aria-label="Tutup pokok iman"
                      onClick={() => setSelected("")}
                    >
                      ×
                    </button>
                  </div>
                  <p className="faith-copy">{active.text}</p>
                  <div className="faith-modal-actions">
                    <button
                      className="quiet-button"
                      type="button"
                      onClick={() => void copySection()}
                    >
                      {translate(locale, "faith.copySection")}
                    </button>
                    <button
                      className="quiet-button"
                      type="button"
                      onClick={share}
                    >
                      {translate(locale, "faith.copyShare")}
                    </button>
                    <button
                      className={`quiet-button${hasNote(active.number) ? " has-note" : ""}`}
                      type="button"
                      onClick={openNote}
                    >
                      {translate(locale, "faith.note")}
                      {hasNote(active.number) ? " ✓" : ""}
                    </button>
                    {DK_READ_MORE.has(active.number) && (
                      <button
                        className="primary-button faith-read-more"
                        type="button"
                        onClick={openReadMore}
                      >
                        Baca lebih lanjut ↗
                      </button>
                    )}
                  </div>
                </div>
              </div>,
              document.body,
            )}
          {!active && (
            <p className="faith-hint">
              {translate(locale, "faith.selectHint")}
            </p>
          )}
        </section>
      )}

      {notePopupOpen &&
        createPortal(
          <div
            className="bible-notes-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Catatan pokok iman"
            onClick={() => setNotePopupOpen(false)}
          >
            <div
              className="bible-notes-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="bible-notes-header">
                <div>
                  <small>{translate(locale, "faith.note")}</small>
                  <strong>
                    {active
                      ? `${translate(locale, "faith.topic", { number: active.number })}`
                      : translate(locale, "faith.note")}
                  </strong>
                </div>
                <span className="bible-notes-count">
                  {savedNotes.length} catatan
                </span>
                <button
                  className="bible-notes-close"
                  type="button"
                  aria-label="Tutup catatan"
                  onClick={() => setNotePopupOpen(false)}
                >
                  ×
                </button>
              </div>
              <div className="bible-notes-body">
                {active && (
                  <div className="bible-selection-panel">
                    <strong>
                      {translate(locale, "faith.topic", {
                        number: active.number,
                      })}{" "}
                      · {active.text.split(/[.!?]/)[0]}
                    </strong>
                    <label className="bible-note-field">
                      <span>{translate(locale, "faith.note")}</span>
                      <textarea
                        value={noteDraft}
                        rows={4}
                        onChange={(event) => setNoteDraft(event.target.value)}
                        placeholder={translate(locale, "faith.notePlaceholder")}
                      />
                    </label>
                    <div className="faith-note-actions">
                      <button
                        className="primary-button"
                        type="button"
                        onClick={saveNote}
                      >
                        {translate(locale, "faith.saveNote")}
                      </button>
                      {noteDraft.trim() && (
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => {
                            setNoteDraft("");
                            deleteNote(active.number);
                          }}
                        >
                          Hapus catatan
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <div className="bible-notes-section-label">
                  <span>Catatan tersimpan</span>
                </div>
                {savedNotes.length > 0 ? (
                  <div className="bible-notes-list">
                    {savedNotes.map((entry) => (
                      <div className="bible-notes-item" key={entry.item.number}>
                        <button
                          className="bible-notes-item-open"
                          type="button"
                          onClick={() => openOtherNote(entry.item.number)}
                        >
                          <strong>
                            {translate(locale, "faith.topic", {
                              number: entry.item.number,
                            })}{" "}
                            · {entry.item.text.split(/[.!?]/)[0]}
                          </strong>
                          <span>{entry.text}</span>
                        </button>
                        <button
                          className="bible-notes-item-delete"
                          type="button"
                          aria-label={`Hapus catatan pokok ${entry.item.number}`}
                          onClick={() => deleteNote(entry.item.number)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="bible-side-empty">
                    {translate(locale, "faith.noNotes")}
                  </p>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {pdfRead &&
        createPortal(
          <div
            className="faith-pdf-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label={pdfRead.title}
            onClick={closeReadMore}
          >
            <div
              className="faith-pdf-overlay"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="faith-pdf-head">
                <div className="faith-pdf-title">
                  <small>Baca lebih lanjut</small>
                  <strong>{pdfRead.title}</strong>
                </div>
                {pdfProgress && (
                  <span className="faith-pdf-stats">
                    Halaman {pdfProgress.page}/{pdfProgress.totalPages} ·{" "}
                    {pdfProgress.percent}% · Terakhir dibuka{" "}
                    {new Date(pdfProgress.lastOpenedAt).toLocaleDateString(
                      locale,
                    )}
                  </span>
                )}
                <div className="faith-pdf-head-actions">
                  <a
                    className="quiet-button"
                    href={DK_READ_MORE.get(pdfRead.number)?.source}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Sumber resmi ↗
                  </a>
                  <button
                    className="bible-notes-close"
                    type="button"
                    aria-label="Tutup bacaan"
                    onClick={closeReadMore}
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="faith-pdf-body">
                <Suspense
                  fallback={
                    <div className="loading-panel">Memuat viewer PDF…</div>
                  }
                >
                  <FaithPdfReader
                    src={faithPdfUrl(pdfRead.url)}
                    initialPage={pdfProgress?.page ?? 1}
                    title={pdfRead.title}
                    progressKey={`faith:dk-${pdfRead.number}`}
                    onPageChange={onPageChange}
                  />
                </Suspense>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
