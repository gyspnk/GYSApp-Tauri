import type { Dispatch, SetStateAction } from "react";
import { createPortal } from "react-dom";
import type { BibleBook } from "@gys/contracts";
import { sanitizeBibleText, type BibleVerse } from "@gys/domain";
import { translate, type Locale } from "./i18n.js";
import type { BibleNotes } from "./bible-reader-storage.js";
export type SavedNoteRow = {
  id: string;
  verseId: string;
  noteId: string;
  verse: BibleVerse;
  text: string;
  label: string;
};
function cleanVerse(verse: BibleVerse) {
  return sanitizeBibleText(verse.text);
}
type BibleNotesPopupProps = {
  locale: Locale;
  notesPopupOpen: boolean;
  savedNotesList: SavedNoteRow[];
  bookmarks: Set<string>;
  selectedVerse: BibleVerse | undefined;
  book: BibleBook | undefined;
  chapter: number;
  noteDraft: string;
  saveNote: () => void;
  selectedVerseId: string | undefined;
  beginNoteForSelectedVerse: () => void;
  addNoteForNewVerse: () => void;
  notes: BibleNotes;
  selectedNoteId: string | undefined;
  setNotesPopupOpen: Dispatch<SetStateAction<boolean>>;
  setNoteDraft: Dispatch<SetStateAction<string>>;
  setSelectedBook: Dispatch<SetStateAction<number>>;
  setSelectedChapter: Dispatch<SetStateAction<number>>;
  setSelectedVerseId: Dispatch<SetStateAction<string | undefined>>;
  setSelectedNoteId: Dispatch<SetStateAction<string | undefined>>;
  setNotes: Dispatch<SetStateAction<BibleNotes>>;
};
export function BibleNotesPopup({
  locale,
  notesPopupOpen,
  setNotesPopupOpen,
  savedNotesList,
  bookmarks,
  selectedVerse,
  book,
  chapter,
  noteDraft,
  setNoteDraft,
  saveNote,
  selectedVerseId,
  beginNoteForSelectedVerse,
  addNoteForNewVerse,
  setSelectedBook,
  setSelectedChapter,
  setSelectedVerseId,
  setSelectedNoteId,
  notes,
  setNotes,
  selectedNoteId,
}: BibleNotesPopupProps) {
  if (!notesPopupOpen) return null;
  return createPortal(
    <div
      className="bible-notes-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={translate(locale, "bible.notes")}
      onClick={() => setNotesPopupOpen(false)}
    >
      <div
        className="bible-notes-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bible-notes-header">
          <div>
            <small>{translate(locale, "bible.savedReading")}</small>
            <strong>{translate(locale, "bible.notes")}</strong>
          </div>
          <span className="bible-notes-count">
            {translate(locale, "bible.noteCount", {
              count: savedNotesList.length,
            })}
            {bookmarks.size > 0
              ? ` · ${translate(locale, "bible.bookmarkCount", {
                  count: bookmarks.size,
                })}`
              : ""}
          </span>
          <button
            className="bible-notes-close"
            type="button"
            aria-label={translate(locale, "bible.closeNotes")}
            onClick={() => setNotesPopupOpen(false)}
          >
            ×
          </button>
        </div>

        <div className="bible-notes-body">
          {selectedVerse && (
            <div className="bible-selection-panel">
              <strong>
                {book?.name} {chapter}:{selectedVerse.verse}
              </strong>
              <p>{cleanVerse(selectedVerse)}</p>
              <label className="bible-note-field">
                <span>{translate(locale, "bible.personalNote")}</span>
                <textarea
                  value={noteDraft}
                  rows={3}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder={translate(locale, "bible.notePlaceholder")}
                />
              </label>
              <button
                className="primary-button"
                type="button"
                onClick={saveNote}
              >
                {translate(locale, "bible.saveNote")}
              </button>
            </div>
          )}

          <div className="bible-notes-section-label">
            <span>{translate(locale, "bible.savedNotes")}</span>
            {savedNotesList.length > 0 && (
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  selectedVerseId
                    ? beginNoteForSelectedVerse()
                    : addNoteForNewVerse()
                }
              >
                {translate(locale, "bible.addNote")}
              </button>
            )}
          </div>
          {savedNotesList.length > 0 ? (
            <div className="bible-notes-list">
              {savedNotesList.map((entry) => (
                <div className="bible-notes-item" key={entry.id}>
                  <button
                    className="bible-notes-item-open"
                    type="button"
                    onClick={() => {
                      setSelectedBook(Number(entry.verse.book));
                      setSelectedChapter(entry.verse.chapter);
                      setSelectedVerseId(entry.verseId);
                      setSelectedNoteId(entry.noteId);
                      setNoteDraft(entry.text);
                    }}
                  >
                    <strong>{entry.label}</strong>
                    <span>{entry.text}</span>
                  </button>
                  <button
                    className="bible-notes-item-delete"
                    type="button"
                    aria-label={translate(locale, "bible.deleteNote", {
                      label: entry.label,
                    })}
                    onClick={() => {
                      const remaining = (notes[entry.verseId] ?? []).filter(
                        (note) => note.id !== entry.noteId,
                      );
                      setNotes((current) => {
                        const next = { ...current };
                        if (remaining.length) next[entry.verseId] = remaining;
                        else delete next[entry.verseId];
                        return next;
                      });
                      if (
                        selectedVerseId === entry.verseId &&
                        selectedNoteId === entry.noteId
                      ) {
                        setSelectedNoteId(remaining[0]?.id);
                        setNoteDraft(remaining[0]?.text ?? "");
                      }
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="bible-side-empty">
              {selectedVerse
                ? translate(locale, "bible.noOtherNotes")
                : translate(locale, "bible.noNotesPrompt")}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
