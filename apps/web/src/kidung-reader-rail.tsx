import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { HymnMetadata } from "@gys/contracts";
import { translate, type Locale } from "./i18n.js";
import {
  hymnCollectionLabel,
  numberLabel,
  type CatalogState,
} from "./kidung-shared.js";
import { Icon } from "./icons.js";
import { Select } from "./select.js";

// One column of the desktop reader: the book's index stays beside the text so
// moving between songs never costs a trip back to the catalog. The catalog page
// keeps its own richer toolbar; this rail only carries what the reader needs.
const RAIL_PAGE = 80;

export function KidungReaderRail({
  locale,
  state,
  activeId,
}: {
  locale: Locale;
  state: CatalogState<HymnMetadata>;
  activeId: string;
}) {
  return (
    <aside
      className="kidung-reader-rail"
      aria-label={translate(locale, "kidung.collection")}
    >
      <RailBody locale={locale} state={state} activeId={activeId} />
    </aside>
  );
}

// Landscape phones and tablets have no room for a permanent rail, so the index
// rides in a disclosure above the text: one tap to pick another song, closed by
// default so the reading surface keeps every row.
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
  onNavigate,
}: {
  locale: Locale;
  state: CatalogState<HymnMetadata>;
  activeId: string;
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const items = state.status === "ready" ? state.items : [];
  const books = useMemo(
    () => [...new Set(items.map((item) => item.book))].sort(),
    [items],
  );
  const active = items.find((item) => item.id === activeId);
  const [book, setBook] = useState(() => active?.book ?? books[0] ?? "");
  const [visible, setVisible] = useState(RAIL_PAGE);
  const shown = items.filter((item) => item.book === book).slice(0, visible);

  return (
    <>
      {books.length > 1 && (
        <Select
          value={book}
          onChange={(value) => {
            setBook(value);
            setVisible(RAIL_PAGE);
          }}
          className="kidung-collection-select"
          label={translate(locale, "kidung.collection")}
          options={books.map((value) => ({
            value,
            label: hymnCollectionLabel(value),
          }))}
        />
      )}
      <ol
        className="kidung-rail-list"
        onScroll={(event) => {
          const list = event.currentTarget;
          if (list.scrollTop + list.clientHeight >= list.scrollHeight - 120)
            setVisible((value) =>
              value >= items.length ? value : value + RAIL_PAGE,
            );
        }}
      >
        {shown.map((item) => (
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
