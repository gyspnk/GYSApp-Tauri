import type { Dispatch, SetStateAction, RefObject, FormEvent } from "react";
import type { BibleBook } from "@gys/contracts";
import { sanitizeBibleText, type BibleVerse } from "@gys/domain";
import { translate, type Locale } from "./i18n.js";
import { Select } from "./select.js";
import { HighlightedText } from "./bible-verse-text.js";
export const SEARCH_RESULTS_PAGE_SIZE = 40;
function cleanVerse(verse: BibleVerse) {
  return sanitizeBibleText(verse.text);
}
type BibleSearchPanelProps = {
  locale: Locale;
  searchOpen: boolean;
  query: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searching: boolean;
  runSearch: (
    event?: FormEvent<HTMLFormElement>,
    query?: string,
  ) => Promise<void>;
  searchFiltersOpen: boolean;
  searchBook: string;
  books: BibleBook[];
  exactPhrase: boolean;
  wholeWord: boolean;
  searchError: string | undefined;
  searchHistory: string[];
  searchResults: BibleVerse[];
  visibleSearchResultCount: number;
  searchedQuery: string;
  setQuery: Dispatch<SetStateAction<string>>;
  setSearchFiltersOpen: Dispatch<SetStateAction<boolean>>;
  setSearchBook: Dispatch<SetStateAction<string>>;
  setExactPhrase: Dispatch<SetStateAction<boolean>>;
  setWholeWord: Dispatch<SetStateAction<boolean>>;
  setSearchResults: Dispatch<SetStateAction<BibleVerse[]>>;
  setVisibleSearchResultCount: Dispatch<SetStateAction<number>>;
  setSearchedQuery: Dispatch<SetStateAction<string>>;
  setSelectedBook: Dispatch<SetStateAction<number>>;
  setSelectedChapter: Dispatch<SetStateAction<number>>;
  setSelectedVerseId: Dispatch<SetStateAction<string | undefined>>;
  setSearchOpen: Dispatch<SetStateAction<boolean>>;
};
export function BibleSearchPanel({
  locale,
  searchOpen,
  query,
  searchInputRef,
  searching,
  runSearch,
  setQuery,
  searchFiltersOpen,
  setSearchFiltersOpen,
  searchBook,
  setSearchBook,
  books,
  exactPhrase,
  setExactPhrase,
  wholeWord,
  setWholeWord,
  searchError,
  searchHistory,
  searchResults,
  setSearchResults,
  visibleSearchResultCount,
  setVisibleSearchResultCount,
  searchedQuery,
  setSearchedQuery,
  setSelectedBook,
  setSelectedChapter,
  setSelectedVerseId,
  setSearchOpen,
}: BibleSearchPanelProps) {
  return (
    <>
      <header
        className={`bible-page-header${searchOpen ? " is-search-open" : ""}`}
      >
        <h1 className="sr-only">{translate(locale, "page.bibleTitle")}</h1>
        <form
          id="bible-search-form"
          className={`bible-search${searchOpen ? " is-open" : ""}`}
          aria-hidden={!searchOpen}
          inert={!searchOpen}
          onSubmit={(event) => void runSearch(event)}
          role="search"
        >
          <label htmlFor="bible-query">
            {translate(locale, "bible.search")}
          </label>
          <div className="search-row">
            <input
              ref={searchInputRef}
              id="bible-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={translate(locale, "bible.searchPlaceholder")}
            />
            <button
              className="primary-button"
              type="submit"
              disabled={searching}
            >
              {searching ? "…" : translate(locale, "bible.searchAction")}
            </button>
          </div>
          <details
            className="bible-search-options-disclosure"
            open={searchFiltersOpen}
            onToggle={(event) => setSearchFiltersOpen(event.currentTarget.open)}
          >
            <summary>{translate(locale, "bible.searchFilters")}</summary>
            <div className="bible-search-options">
              <Select
                value={searchBook}
                onChange={setSearchBook}
                label={translate(locale, "bible.book")}
                options={[
                  {
                    value: "all",
                    label: translate(locale, "bible.allBooks"),
                  },
                  {
                    value: "old",
                    label: translate(locale, "bible.oldTestament"),
                  },
                  {
                    value: "new",
                    label: translate(locale, "bible.newTestament"),
                  },
                  ...books.map((candidate) => ({
                    value: String(candidate.id),
                    label: candidate.name,
                  })),
                ]}
              />
              <label className="check-option">
                <input
                  type="checkbox"
                  checked={exactPhrase}
                  onChange={(event) => setExactPhrase(event.target.checked)}
                />{" "}
                {translate(locale, "bible.exactPhrase")}
              </label>
              <label className="check-option">
                <input
                  type="checkbox"
                  checked={wholeWord}
                  onChange={(event) => setWholeWord(event.target.checked)}
                />{" "}
                {translate(locale, "bible.wholeWord")}
              </label>
            </div>
          </details>
          {searchError && (
            <div className="inline-error" role="alert">
              <span>{searchError}</span>
              <button
                className="text-button"
                type="button"
                onClick={() => void runSearch(undefined, query)}
                disabled={searching || !query.trim()}
              >
                {translate(locale, "bible.retrySearch")}
              </button>
            </div>
          )}
          {searchHistory.length > 0 && !query && (
            <div
              className="bible-search-history"
              aria-label={translate(locale, "bible.searchHistory")}
            >
              {searchHistory.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => {
                    setQuery(entry);
                    void runSearch(undefined, entry);
                  }}
                >
                  {entry}
                </button>
              ))}
            </div>
          )}
        </form>
      </header>

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
              onClick={() => {
                setSearchResults([]);
                setVisibleSearchResultCount(SEARCH_RESULTS_PAGE_SIZE);
                setSearchedQuery("");
              }}
            >
              {translate(locale, "bible.closeResults")}
            </button>
          </div>
          <div className="result-list">
            {searchResults.slice(0, visibleSearchResultCount).map((result) => (
              <button
                className="result-item"
                key={result.id}
                type="button"
                onClick={() => {
                  setSelectedBook(Number(result.book));
                  setSelectedChapter(result.chapter);
                  setSelectedVerseId(result.id);
                  setSearchResults([]);
                  setVisibleSearchResultCount(SEARCH_RESULTS_PAGE_SIZE);
                  setSearchedQuery("");
                  setSearchOpen(false);
                }}
              >
                <strong>
                  {books.find(
                    (candidate) => String(candidate.id) === result.book,
                  )?.name ?? result.book}{" "}
                  {result.chapter}:{result.verse}
                </strong>
                <span>
                  <HighlightedText text={cleanVerse(result)} query={query} />
                </span>
              </button>
            ))}
          </div>
          {searchResults.length > visibleSearchResultCount && (
            <button
              className="text-button"
              type="button"
              onClick={() =>
                setVisibleSearchResultCount((current) =>
                  Math.min(
                    current + SEARCH_RESULTS_PAGE_SIZE,
                    searchResults.length,
                  ),
                )
              }
            >
              {translate(locale, "bible.showMoreResults")}
            </button>
          )}
        </section>
      )}
      {searchedQuery &&
        !searching &&
        !searchError &&
        searchResults.length === 0 &&
        searchedQuery === query.trim() && (
          <div className="empty-panel" role="status">
            {translate(locale, "bible.noResults")}
          </div>
        )}
    </>
  );
}
