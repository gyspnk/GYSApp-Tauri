/** Remember the collection a reader opened, so the catalogue returns to it. */
export const KIDUNG_COLLECTION_KEY = "gys-kidung-collection-v1";

export function readStoredCollection(): string {
  try {
    const value = window.localStorage.getItem(KIDUNG_COLLECTION_KEY);
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

export function writeStoredCollection(book: string) {
  try {
    if (book) window.localStorage.setItem(KIDUNG_COLLECTION_KEY, book);
    else window.localStorage.removeItem(KIDUNG_COLLECTION_KEY);
  } catch {
    /* private mode */
  }
}

/**
 * One collection is always active. A remembered book wins when the catalogue
 * still has it, otherwise KR is the default and the first book is the fallback.
 */
export function resolveCollection(
  books: readonly string[],
  stored: string,
): string {
  if (stored && books.includes(stored)) return stored;
  return books.includes("rohani") ? "rohani" : (books[0] ?? "");
}
