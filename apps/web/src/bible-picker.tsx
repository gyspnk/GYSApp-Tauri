import {
  useDeferredValue,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { BibleBook, BibleVerse } from "@gys/contracts";
import { sanitizeBibleText } from "@gys/domain";
import { useDialogFocus } from "./dialog-focus.js";
import { editPickerNumber, validPickerNumber } from "./bible-picker-number.js";
import { hapticTick } from "./haptics.js";
import { Icon } from "./icons.js";
import { translate, type Locale } from "./i18n.js";
import { useMenuPresence } from "./use-menu-presence.js";
import "./bible-picker.css";

type Field = "book" | "chapter" | "verse";
type NumberField = Exclude<Field, "book">;
type Draft = { bookId: number; chapter: string; verse: string };
type Option = {
  label: string;
  bookId: number;
  chapter?: number;
  verse?: number;
  text?: string;
};

/** Navigation is a draft until the explicit open action. No mobile keyboard
 * appears for chapter/verse entry: first tap edits, second tap opens the list. */
export function BiblePickerModal({
  open,
  onClose,
  books,
  currentBookId,
  currentChapter,
  currentVerse,
  allVerses,
  onSelect,
  restoreFocusTarget,
  locale = "id",
}: {
  open: boolean;
  onClose: () => void;
  books: readonly BibleBook[];
  currentBookId: number;
  currentChapter: number;
  currentVerse?: number | undefined;
  allVerses?: readonly BibleVerse[] | undefined;
  onSelect: (target: {
    bookId: number;
    chapter: number;
    verse?: number;
  }) => void;
  restoreFocusTarget?: HTMLElement | null;
  locale?: Locale;
}) {
  const id = useId();
  const [draft, setDraft] = useState<Draft>({
    bookId: currentBookId,
    chapter: String(currentChapter),
    verse: String(currentVerse ?? 1),
  });
  const [editing, setEditing] = useState<NumberField>("chapter");
  const [armedField, setArmedField] = useState<NumberField | null>(null);
  const [replace, setReplace] = useState(true);
  const [menu, setMenu] = useState<Field | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"all" | "old" | "new" | "current">("all");
  const search = useDeferredValue(query.trim().toLowerCase());
  const dialogRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fields = useRef<Partial<Record<Field, HTMLButtonElement>>>({});
  const openerRef = useRef<HTMLElement | null>(restoreFocusTarget ?? null);
  const wasOpen = useRef(false);
  const present = useMenuPresence(open, layerRef);
  const menuPresent = useMenuPresence(menu !== null, menuRef);
  const renderedMenu = useRef<Field>("book");
  if (menu) renderedMenu.current = menu;
  const listField = menu ?? renderedMenu.current;

  useEffect(() => {
    if (!open) return;
    setDraft({
      bookId: currentBookId,
      chapter: String(currentChapter),
      verse: String(currentVerse ?? 1),
    });
    setEditing("chapter");
    setArmedField(null);
    setReplace(true);
    setMenu(null);
    setQuery("");
    setScope("all");
    if (restoreFocusTarget) openerRef.current = restoreFocusTarget;
  }, [open, currentBookId, currentChapter, currentVerse, restoreFocusTarget]);
  useEffect(() => {
    if (!present) return;
    const app = document.getElementById("root");
    const previousInert = app?.inert ?? false;
    const previousOverflow = document.body.style.overflow;
    if (app) app.inert = true;
    document.body.style.overflow = "hidden";
    return () => {
      if (app) app.inert = previousInert;
      document.body.style.overflow = previousOverflow;
    };
  }, [present]);
  useDialogFocus({
    open,
    dialogRef,
    openerRef,
    onClose,
    initialFocusSelector: '[data-picker-field="chapter"]',
  });
  useEffect(() => {
    if (open) wasOpen.current = true;
    else if (!present && wasOpen.current) {
      wasOpen.current = false;
      if (openerRef.current?.isConnected)
        openerRef.current.focus({ preventScroll: true });
    }
  }, [open, present]);
  useEffect(() => {
    if (!open) setMenu(null);
  }, [open]);

  const book = books.find((item) => item.id === draft.bookId) ?? books[0];
  // Index once while the picker is visible, rather than scanning every verse
  // on each digit or keeping another index alive on the reading page.
  const verseLimits = useMemo(() => {
    const limits = new Map<string, number>();
    if (present)
      for (const verse of allVerses ?? []) {
        const key = `${verse.book}:${verse.chapter}`;
        limits.set(key, Math.max(limits.get(key) ?? 0, verse.verse));
      }
    return limits;
  }, [allVerses, present]);
  const chapterValid = validPickerNumber(draft.chapter, book?.chapters ?? 1);
  const verseMaximum =
    verseLimits.get(`${draft.bookId}:${Number(draft.chapter)}`) ?? 1;
  const verseValid = validPickerNumber(draft.verse, verseMaximum);
  const canOpen = Boolean(book && chapterValid && verseValid);
  const options = useMemo<Option[]>(() => {
    if (!menuPresent) return [];
    if (listField !== "book")
      return Array.from(
        {
          length:
            listField === "chapter"
              ? (book?.chapters ?? 1)
              : chapterValid
                ? verseMaximum
                : 0,
        },
        (_, index) => ({ label: String(index + 1), bookId: draft.bookId }),
      );
    const inScope = (bookId: number) =>
      scope === "all" ||
      (scope === "old" && bookId <= 39) ||
      (scope === "new" && bookId >= 40) ||
      (scope === "current" && bookId === currentBookId);
    const result: Option[] = books
      .filter(
        (item) =>
          inScope(item.id) &&
          (!search || item.name.toLowerCase().includes(search)),
      )
      .map((item) => ({ label: item.name, bookId: item.id }));
    if (!search) return result;
    const names = new Map(books.map((item) => [String(item.id), item.name]));
    const terms = search.split(/\s+/);
    let matches = 0;
    for (const verse of allVerses ?? []) {
      if (!inScope(Number(verse.book))) continue;
      const name =
        names.get(verse.book) ??
        translate(locale, "bible.pickerBookFallback", { book: verse.book });
      const text = sanitizeBibleText(verse.text);
      const label = `${name} ${verse.chapter}:${verse.verse}`;
      const searchable = `${label} ${text}`.toLowerCase();
      if (!terms.every((term) => searchable.includes(term))) continue;
      result.push({
        label,
        text,
        bookId: Number(verse.book),
        chapter: verse.chapter,
        verse: verse.verse,
      });
      if (++matches >= 80) break;
    }
    return result;
  }, [
    listField,
    menuPresent,
    book,
    chapterValid,
    verseMaximum,
    draft.bookId,
    books,
    scope,
    search,
    currentBookId,
    allVerses,
    locale,
  ]);
  useEffect(() => {
    setActiveIndex(0);
  }, [search, scope]);
  useLayoutEffect(() => {
    if (!menu) return;
    const option = menuRef.current?.querySelector<HTMLElement>(
      `[data-picker-option="${activeIndex}"]`,
    );
    option?.scrollIntoView({ block: "nearest" });
  }, [menu, activeIndex]);

  const hideMenu = () => {
    setMenu(null);
    setArmedField(null);
  };
  const startEditing = (field: NumberField) => {
    setEditing(field);
    setArmedField(field);
    setReplace(true);
    setMenu(null);
  };
  const showMenu = (field: Field) => {
    setMenu(field);
    setReplace(true);
    setActiveIndex(
      field === "book"
        ? Math.max(
            0,
            books.findIndex((item) => item.id === draft.bookId),
          )
        : Math.max(
            0,
            Math.min(
              field === "chapter"
                ? (book?.chapters ?? 1) - 1
                : verseMaximum - 1,
              Number(draft[field]) - 1,
            ),
          ),
    );
  };
  const activate = (field: Field) => {
    if (menu === field) {
      hideMenu();
      return;
    }
    if (field === "book") {
      setQuery("");
      setScope("all");
      showMenu(field);
    } else if (armedField === field) showMenu(field);
    else startEditing(field);
  };
  const typeNumber = (key: string, field = editing) => {
    const next = editPickerNumber(
      { text: draft[field], replace: editing !== field || replace },
      key,
    );
    setEditing(field);
    setDraft((current) => ({
      ...current,
      [field]: next.text,
      ...(field === "chapter" && next.text !== current.chapter
        ? { verse: "1" }
        : {}),
    }));
    setReplace(next.replace);
    setArmedField(field);
    setMenu(null);
    hapticTick("light");
  };
  const choose = (option: Option) => {
    if (listField === "book")
      setDraft({
        bookId: option.bookId,
        chapter: String(option.chapter ?? 1),
        verse: String(option.verse ?? 1),
      });
    else
      setDraft((current) => ({
        ...current,
        [listField]: option.label,
        ...(listField === "chapter" ? { verse: "1" } : {}),
      }));
    setEditing(listField === "verse" || option.verse ? "verse" : "chapter");
    setReplace(true);
    hideMenu();
    fields.current[listField]?.focus({ preventScroll: true });
    hapticTick("light");
  };
  const fieldKeyDown = (event: KeyboardEvent, field: Field) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Escape" && menu) {
      event.preventDefault();
      hideMenu();
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (menu !== field) showMenu(field);
      else
        setActiveIndex((value) =>
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? options.length - 1
              : Math.max(
                  0,
                  Math.min(
                    options.length - 1,
                    value + (event.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
        );
    } else if ((event.key === "Enter" || event.key === " ") && menu === field) {
      event.preventDefault();
      if (options[activeIndex]) choose(options[activeIndex]);
    } else if (
      field !== "book" &&
      (/^\d$/.test(event.key) || event.key === "Backspace")
    ) {
      event.preventDefault();
      typeNumber(event.key, field);
    }
  };
  const labelFor = (field: Field) =>
    field === "book"
      ? translate(locale, "bible.book")
      : field === "chapter"
        ? translate(locale, "bible.chapter")
        : translate(locale, "bible.quickVerse");
  const openReference = () => {
    if (!canOpen) return;
    hapticTick("medium");
    onSelect({
      bookId: draft.bookId,
      chapter: Number(draft.chapter),
      verse: Number(draft.verse),
    });
    onClose();
  };
  if (!present) return null;
  return (
    <div
      ref={layerRef}
      className="bible-picker-backdrop"
      data-menu-open={open}
      inert={!open}
      aria-hidden={!open}
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="bible-picker-modal bible-address-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        ref={dialogRef}
        onPointerDown={(event) => {
          if (
            menu &&
            event.target instanceof Element &&
            !event.target.closest(".bible-address-fields")
          )
            hideMenu();
        }}
        onKeyDown={(event) => {
          if (
            event.defaultPrevented ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            event.target instanceof HTMLInputElement
          )
            return;
          if (event.key === "Escape" && menu) {
            event.preventDefault();
            hideMenu();
            fields.current[listField]?.focus({ preventScroll: true });
          } else if (/^\d$/.test(event.key) || event.key === "Backspace") {
            event.preventDefault();
            typeNumber(event.key);
          }
        }}
      >
        <div className="bible-picker-header">
          <Icon name="bible" size={20} />
          <h2 id={`${id}-title`}>{translate(locale, "bible.pickerTitle")}</h2>
          <button
            type="button"
            className="bible-picker-close"
            aria-label={translate(locale, "bible.closePicker")}
            onClick={onClose}
          >
            <Icon name="cancel" size={19} />
          </button>
        </div>
        <div className="bible-address-body">
          <div
            className="bible-address-fields"
            role="group"
            aria-label={translate(locale, "bible.pickerSteps")}
          >
            {(["book", "chapter", "verse"] as const).map((field) => (
              <div key={field} className={`bible-address-field is-${field}`}>
                <span id={`${id}-${field}-label`}>{labelFor(field)}</span>
                <button
                  ref={(node) => {
                    if (node) fields.current[field] = node;
                  }}
                  type="button"
                  role="combobox"
                  aria-labelledby={`${id}-${field}-label`}
                  aria-haspopup="listbox"
                  aria-expanded={menu === field}
                  aria-controls={
                    menuPresent && listField === field
                      ? `${id}-list`
                      : undefined
                  }
                  aria-activedescendant={
                    menu === field && options[activeIndex]
                      ? `${id}-option-${activeIndex}`
                      : undefined
                  }
                  aria-invalid={
                    field === "chapter"
                      ? !chapterValid
                      : field === "verse"
                        ? !verseValid
                        : undefined
                  }
                  data-picker-field={field}
                  data-editing={field === editing}
                  className="bible-address-trigger"
                  onClick={() => activate(field)}
                  onFocus={() => {
                    if (field !== "book" && field !== editing) {
                      setEditing(field);
                      setReplace(true);
                      setArmedField(null);
                    }
                  }}
                  onKeyDown={(event) => fieldKeyDown(event, field)}
                >
                  <strong data-replace={field === editing && replace}>
                    {field === "book"
                      ? (book?.name ?? translate(locale, "bible.pickerChoose"))
                      : draft[field] || "—"}
                  </strong>
                  <Icon name="chevronDown" size={15} />
                </button>
              </div>
            ))}
            {menuPresent && (
              <div
                ref={menuRef}
                className="bible-address-menu"
                data-menu-open={menu !== null}
                inert={menu === null}
                aria-hidden={menu === null}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    hideMenu();
                    fields.current[listField]?.focus({ preventScroll: true });
                  }
                }}
              >
                {listField === "book" && (
                  <>
                    <div className="bible-picker-search-field">
                      <Icon name="search" size={17} />
                      <input
                        type="search"
                        className="bible-picker-search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={translate(
                          locale,
                          "bible.pickerSearchPlaceholder",
                        )}
                        aria-label={translate(locale, "bible.pickerSearchAria")}
                        onKeyDown={(event) => {
                          if (event.key === "ArrowDown") {
                            event.preventDefault();
                            setActiveIndex(0);
                            fields.current.book?.focus({ preventScroll: true });
                          } else if (
                            event.key === "Enter" &&
                            options[activeIndex]
                          ) {
                            event.preventDefault();
                            choose(options[activeIndex]);
                          }
                        }}
                      />
                    </div>
                    <div className="bible-picker-testament-pills">
                      {(["all", "old", "new", "current"] as const).map(
                        (value) => (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={scope === value}
                            onClick={() => setScope(value)}
                          >
                            {value === "all"
                              ? translate(locale, "bible.scopeAll", {
                                  count: books.length,
                                })
                              : value === "old"
                                ? translate(locale, "bible.scopeOld", {
                                    count: 39,
                                  })
                                : value === "new"
                                  ? translate(locale, "bible.scopeNew", {
                                      count: 27,
                                    })
                                  : translate(locale, "bible.scopeCurrent", {
                                      book:
                                        books.find(
                                          (item) => item.id === currentBookId,
                                        )?.name ?? "",
                                    })}
                          </button>
                        ),
                      )}
                    </div>
                  </>
                )}
                <div
                  id={`${id}-list`}
                  role="listbox"
                  aria-label={labelFor(listField)}
                  className={`bible-address-options${listField !== "book" ? " is-numbers" : ""}`}
                  aria-busy={
                    listField === "book" &&
                    query.trim().toLowerCase() !== search
                  }
                >
                  {options.map((option, index) => (
                    <button
                      key={`${option.bookId}-${option.chapter ?? 0}-${option.verse ?? option.label}`}
                      id={`${id}-option-${index}`}
                      data-picker-option={index}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={
                        listField === "book"
                          ? option.bookId === draft.bookId &&
                            (!option.verse ||
                              (option.chapter === Number(draft.chapter) &&
                                option.verse === Number(draft.verse)))
                          : option.label === draft[listField]
                      }
                      className={`${index === activeIndex ? "is-active" : ""}${option.text ? " bible-picker-verse-item" : ""}`}
                      onClick={() => choose(option)}
                      onPointerMove={() => setActiveIndex(index)}
                    >
                      <span>{option.label}</span>
                      {option.text && <small>{option.text}</small>}
                    </button>
                  ))}
                  {!options.length && (
                    <p>
                      {translate(locale, "bible.pickerNoResults", { query })}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
          <div
            className="bible-picker-numpad"
            role="group"
            aria-label={translate(locale, "bible.pickerNumberPad")}
          >
            {Array.from({ length: 9 }, (_, index) => (
              <button
                key={index + 1}
                type="button"
                onClick={() => typeNumber(String(index + 1))}
              >
                {index + 1}
              </button>
            ))}
            <button
              type="button"
              className="bible-numpad-utility"
              aria-label={translate(locale, "bible.pickerDelete")}
              onClick={() => typeNumber("Backspace")}
            >
              <svg
                viewBox="0 0 24 24"
                width="21"
                height="21"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 5h11v14H9l-7-7 7-7Z" />
                <path d="m12 9 6 6m0-6-6 6" />
              </svg>
            </button>
            <button type="button" onClick={() => typeNumber("0")}>
              0
            </button>
            <button
              type="button"
              className="bible-numpad-next"
              aria-label={
                editing === "chapter"
                  ? translate(locale, "bible.pickerEditVerse")
                  : translate(locale, "bible.pickerEditChapter")
              }
              onClick={() => {
                const next = editing === "chapter" ? "verse" : "chapter";
                startEditing(next);
                fields.current[next]?.focus({ preventScroll: true });
              }}
            >
              <Icon name="arrow" size={21} />
            </button>
          </div>
          <div className="bible-picker-footer">
            <span className="bible-picker-preview" aria-live="polite">
              {book?.name}{" "}
              <strong>
                {draft.chapter || "—"}:{draft.verse || "—"}
              </strong>
            </span>
            <button
              type="button"
              className="bible-picker-open"
              disabled={!canOpen}
              onClick={openReference}
            >
              {translate(locale, "bible.pickerOpenVerse")}
              <Icon name="arrow" size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
