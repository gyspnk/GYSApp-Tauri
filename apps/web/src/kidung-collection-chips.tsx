import { hymnCollectionLabel } from "./kidung-shared.js";

/**
 * The collection switch, shared by the catalog header and the desktop reader
 * rail. One copy keeps the 44 px chip target and the pressed state honest in
 * both places instead of drifting apart.
 */
export function KidungCollectionChips({
  books,
  active,
  label,
  onSelect,
}: {
  books: readonly string[];
  active: string;
  label: string;
  onSelect: (book: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className="kidung-collection-chips">
      {books.map((value) => (
        <button
          key={value}
          type="button"
          className="kidung-collection-chip"
          aria-pressed={value === active}
          onClick={() => onSelect(value)}
        >
          {hymnCollectionLabel(value)}
        </button>
      ))}
    </div>
  );
}
