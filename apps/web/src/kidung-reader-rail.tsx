import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { HymnMetadata } from "@gys/contracts";
import { translate, type Locale } from "./i18n.js";
import { numberLabel, type CatalogState } from "./kidung-shared.js";
import { KidungCollectionChips } from "./kidung-collection-chips.js";

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
    <aside
      className="kidung-reader-rail"
      aria-label={translate(locale, "kidung.collection")}
    >
      {books.length > 1 && (
        <KidungCollectionChips
          books={books}
          active={book}
          label={translate(locale, "kidung.collection")}
          onSelect={(value) => {
            setBook(value);
            setVisible(RAIL_PAGE);
          }}
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
              onClick={() =>
                navigate(`/kidung/${item.id}${location.search}`, {
                  replace: true,
                })
              }
            >
              <span className="kidung-rail-number" aria-hidden="true">
                {numberLabel(item.number, item.id)}
              </span>
              <span className="kidung-rail-title">{item.title}</span>
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}
