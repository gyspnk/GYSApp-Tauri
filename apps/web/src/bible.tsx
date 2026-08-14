import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  BibleReaderPackSchema,
  type BibleBook,
  type BibleReaderPack,
} from "@gys/contracts";
import { BibleRepository, type BibleVerse } from "@gys/domain";
import { translate, type Locale } from "./i18n.js";

type PackState =
  | { status: "loading" }
  | { status: "ready"; pack: BibleReaderPack }
  | { status: "error"; message: string };

function readSavedNumber(key: string, fallback: number): number {
  const saved = Number(localStorage.getItem(key));
  return Number.isInteger(saved) && saved > 0 ? saved : fallback;
}

export function BiblePage({ locale }: { locale: Locale }) {
  const [packState, setPackState] = useState<PackState>({ status: "loading" });
  const [selectedBook, setSelectedBook] = useState(() =>
    readSavedNumber("gys-bible-book", 43),
  );
  const [selectedChapter, setSelectedChapter] = useState(() =>
    readSavedNumber("gys-bible-chapter", 3),
  );
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<BibleVerse[]>([]);
  const [searching, setSearching] = useState(false);
  const [bookmarks, setBookmarks] = useState<Set<string>>(
    () =>
      new Set(JSON.parse(localStorage.getItem("gys-bible-bookmarks") ?? "[]")),
  );
  const [speaking, setSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${import.meta.env.BASE_URL}offline/bible/tb-reader.json`, {
      signal: controller.signal,
      cache: "force-cache",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Offline TB reader pack unavailable");
        const json: unknown = await response.json();
        const parsed = BibleReaderPackSchema.safeParse(json);
        if (!parsed.success) throw new Error("TB reader pack is invalid");
        setPackState({ status: "ready", pack: parsed.data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setPackState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to load the offline TB reader",
          });
      });
    return () => controller.abort();
  }, []);

  const repository = useMemo(
    () =>
      packState.status === "ready"
        ? new BibleRepository(packState.pack.verses)
        : undefined,
    [packState],
  );
  const books = packState.status === "ready" ? packState.pack.books : [];
  const book =
    books.find((candidate) => candidate.id === selectedBook) ?? books[0];
  const chapter = Math.min(selectedChapter, book?.chapters ?? selectedChapter);
  const chapterVerses = useMemo(() => {
    if (!packState || packState.status !== "ready" || !book) return [];
    const key = `${book.id}:${chapter}`;
    return packState.pack.verses.filter(
      (verse) => `${verse.book}:${verse.chapter}` === key,
    );
  }, [book, chapter, packState]);

  useEffect(() => {
    if (!book) return;
    setSelectedBook(book.id);
    setSelectedChapter((value) => Math.min(value, book.chapters));
  }, [book]);

  useEffect(() => {
    localStorage.setItem("gys-bible-book", String(selectedBook));
    localStorage.setItem("gys-bible-chapter", String(chapter));
    if (book)
      localStorage.setItem(
        "gys-bible-last-reading",
        JSON.stringify({ book: book.name, chapter }),
      );
  }, [book, chapter, selectedBook]);

  useEffect(() => {
    localStorage.setItem("gys-bible-bookmarks", JSON.stringify([...bookmarks]));
  }, [bookmarks]);

  useEffect(() => {
    return () => window.speechSynthesis?.cancel();
  }, []);

  const runSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!repository || !query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    setSearchResults(await repository.search(query));
    setSearching(false);
  };

  const toggleBookmark = (id: string) => {
    setBookmarks((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const speakChapter = () => {
    if (!chapterVerses.length || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      chapterVerses.map((verse) => `${verse.verse}. ${verse.text}`).join(" "),
    );
    utterance.lang =
      locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "id-ID";
    utterance.rate = 0.9;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const copyChapter = async () => {
    if (!chapterVerses.length) return;
    try {
      await navigator.clipboard?.writeText(
        `${book?.name ?? ""} ${chapter}\n${chapterVerses
          .map((verse) => `${verse.verse}. ${verse.text}`)
          .join("\n")}`,
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="page bible-page">
      <section className="page-intro">
        <div>
          <p className="date-line">TB · offline reader</p>
          <h1>{translate(locale, "page.bibleTitle")}</h1>
          <p className="intro-copy">{translate(locale, "page.bibleBody")}</p>
        </div>
        <span className="pack-badge">TB · 66 buku</span>
      </section>

      <form className="bible-search" onSubmit={runSearch} role="search">
        <label htmlFor="bible-query">{translate(locale, "bible.search")}</label>
        <div className="search-row">
          <input
            id="bible-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={translate(locale, "bible.searchPlaceholder")}
          />
          <button className="primary-button" type="submit" disabled={searching}>
            {searching ? "…" : translate(locale, "bible.searchAction")}
          </button>
        </div>
      </form>

      {searchResults.length > 0 && (
        <section
          className="search-results"
          aria-label={translate(locale, "bible.results")}
        >
          <div className="section-title-row">
            <h2>{translate(locale, "bible.results")}</h2>
            <button
              className="text-button"
              type="button"
              onClick={() => setSearchResults([])}
            >
              {translate(locale, "bible.closeResults")}
            </button>
          </div>
          <div className="result-list">
            {searchResults.slice(0, 20).map((result) => (
              <button
                className="result-item"
                key={result.id}
                type="button"
                onClick={() => {
                  setSelectedBook(Number(result.book));
                  setSelectedChapter(result.chapter);
                  setSearchResults([]);
                }}
              >
                <strong>
                  {books.find(
                    (candidate) => String(candidate.id) === result.book,
                  )?.name ?? result.book}{" "}
                  {result.chapter}:{result.verse}
                </strong>
                <span>{result.text}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {packState.status === "loading" && (
        <div className="loading-panel" role="status">
          {translate(locale, "bible.loading")}
        </div>
      )}
      {packState.status === "error" && (
        <div className="error-panel" role="alert">
          <strong>{translate(locale, "bible.offlineError")}</strong>
          <span>{packState.message}</span>
        </div>
      )}

      {packState.status === "ready" && book && (
        <section
          className="bible-reader"
          aria-label={translate(locale, "page.bibleTitle")}
        >
          <div className="reader-toolbar">
            <label>
              <span>{translate(locale, "bible.book")}</span>
              <select
                value={book.id}
                onChange={(event) => {
                  setSelectedBook(Number(event.target.value));
                  setSelectedChapter(1);
                }}
              >
                {books.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{translate(locale, "bible.chapter")}</span>
              <select
                value={chapter}
                onChange={(event) =>
                  setSelectedChapter(Number(event.target.value))
                }
              >
                {Array.from(
                  { length: book.chapters },
                  (_, index) => index + 1,
                ).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <span className="reader-spacer" />
            <button
              className="quiet-button"
              type="button"
              onClick={copyChapter}
            >
              {copied
                ? translate(locale, "bible.copied")
                : translate(locale, "bible.copy")}
            </button>
            <button
              className="quiet-button"
              type="button"
              onClick={() => {
                if (speaking) {
                  window.speechSynthesis.cancel();
                  setSpeaking(false);
                } else speakChapter();
              }}
              disabled={!window.speechSynthesis}
            >
              {speaking
                ? translate(locale, "bible.stopReading")
                : translate(locale, "bible.readAloud")}
            </button>
          </div>
          <div className="reader-heading">
            <div>
              <p className="date-line">Terjemahan Baru</p>
              <h2>
                {book.name} {chapter}
              </h2>
            </div>
            <span>{chapterVerses.length} ayat</span>
          </div>
          <div className="verse-list">
            {chapterVerses.map((verse) => (
              <article className="verse-row" key={verse.id}>
                <button
                  className={`verse-number${bookmarks.has(verse.id) ? " is-bookmarked" : ""}`}
                  type="button"
                  onClick={() => toggleBookmark(verse.id)}
                  aria-label={`${translate(locale, "bible.bookmark")} ${verse.verse}`}
                >
                  {verse.verse}
                </button>
                <p>{verse.text}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
