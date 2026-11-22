import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { HymnMetadata } from "@gys/contracts";
import { translate, type Locale } from "./i18n.js";
import {
  hymnCollectionLabel,
  numberLabel,
  uniqueItems,
  type CatalogState,
} from "./kidung-shared.js";
import { resolveCollection } from "./kidung-collection-store.js";
import { Icon } from "./icons.js";
import { Select } from "./select.js";

// One column of the desktop reader: the book's full index stays beside the text
// so moving between songs never costs a trip back to the catalog and never
// truncates KR (or any other collection) behind incremental scroll pages.

export function KidungReaderRail({
  locale,
  state,
  activeId,
  collapsed = false,
  onCollapse,
}: {
  locale: Locale;
  state: CatalogState<HymnMetadata>;
  activeId: string;
  collapsed?: boolean | undefined;
  onCollapse?: (() => void) | undefined;
}) {
  return (
    <aside
      className={`kidung-reader-rail${collapsed ? " is-collapsed" : ""}`}
      aria-label={translate(locale, "kidung.collection")}
      aria-hidden={collapsed || undefined}
      inert={collapsed || undefined}
    >
      <RailBody
        locale={locale}
        state={state}
        activeId={activeId}
        collapsed={collapsed}
        {...(onCollapse ? { onCollapse, railHeader: true } : {})}
      />
    </aside>
  );
}

export function KidungReaderPicker({
  locale,
  state,
  activeId,
  onNavigate,
}: {
  locale: Locale;
  state: CatalogState<HymnMetadata>;
  activeId: string;
  onNavigate?: () => void;
}) {
  const items = state.status === "ready" ? state.items : [];
  const active = items.find((item) => item.id === activeId);
  return (
    <details className="kidung-reader-picker">
      <summary>
        <Icon name="book" size={16} />
        <span className="kidung-reader-picker-label">
          {translate(locale, "kidung.collection")}
        </span>
        <span className="kidung-reader-picker-current">
          {active
            ? `${numberLabel(active.number, active.id)} · ${active.title}`
            : ""}
        </span>
        <Icon name="chevronDown" size={16} />
      </summary>
      <div className="kidung-reader-picker-body">
        <RailBody
          locale={locale}
          state={state}
          activeId={activeId}
          {...(onNavigate ? { onNavigate } : {})}
        />
      </div>
    </details>
  );
}

function RailBody({
  locale,
  state,
  activeId,
  collapsed = false,
  onNavigate,
  onCollapse,
  railHeader = false,
}: {
  locale: Locale;
  state: CatalogState<HymnMetadata>;
  activeId: string;
  collapsed?: boolean | undefined;
  onNavigate?: (() => void) | undefined;
  onCollapse?: (() => void) | undefined;
  railHeader?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const items = useMemo(
    () => (state.status === "ready" ? uniqueItems(state.items) : []),
    [state],
  );
  const books = useMemo(
    () => [...new Set(items.map((item) => item.book))].sort(),
    [items],
  );
  const active = useMemo(
    () => items.find((item) => item.id === activeId),
    [items, activeId],
  );
  const [book, setBook] = useState(() =>
    resolveCollection(books, active?.book ?? ""),
  );
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (active?.book) setBook(active.book);
    else if (!book && books.length > 0) setBook(resolveCollection(books, ""));
  }, [active?.book, book, books]);

  const activeBook = book && books.includes(book) ? book : resolveCollection(books, active?.book ?? "");

  // Load every song in the active collection at once, ordered by hymn number,
  // so opening KR lyrics mode immediately exposes the full song list.
  const bookItems = useMemo(
    () =>
      items
        .filter((item) => item.book === activeBook)
        .sort((a, b) => a.number - b.number),
    [items, activeBook],
  );

  useEffect(() => {
    if (collapsed) return;
    const row = listRef.current?.querySelector<HTMLElement>(
      '.kidung-rail-row[aria-current="page"]',
    );
    if (!row) return;
    row.scrollIntoView({
      block: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [activeId, collapsed, activeBook]);

  const collectionSelect =
    books.length > 1 ? (
      <Select
        value={activeBook}
        onChange={setBook}
        className="kidung-collection-select"
        label={translate(locale, "kidung.collection")}
        options={books.map((value) => ({
          value,
          label: hymnCollectionLabel(value),
        }))}
      />
    ) : null;

  return (
    <>
      {railHeader && onCollapse ? (
        <div className="kidung-rail-header">
          {collectionSelect ?? (
            <span className="kidung-rail-heading">
              {translate(locale, "kidung.songs")}
            </span>
          )}
          <button
            type="button"
            className="kidung-rail-toggle"
            onClick={onCollapse}
            aria-expanded={!collapsed}
            aria-label={translate(locale, "kidung.collapseList")}
            title={translate(locale, "kidung.collapseList")}
          >
            <Icon name="panelLeftClose" size={18} />
          </button>
        </div>
      ) : (
        collectionSelect
      )}
      <ol ref={listRef} className="kidung-rail-list">
        {bookItems.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="kidung-rail-row"
              aria-current={item.id === activeId ? "page" : undefined}
              onClick={() => {
                navigate(`/kidung/${item.id}${location.search}`, {
                  replace: true,
                });
                onNavigate?.();
              }}
            >
              <span className="kidung-rail-number" aria-hidden="true">
                {numberLabel(item.number, item.id)}
              </span>
              <span className="kidung-rail-title">{item.title}</span>
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}
