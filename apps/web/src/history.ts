export type ActivityState = {
  version: 1;
  bible?: { book: string; chapter: number; updatedAt: string };
  hymn?: {
    id: string;
    title: string;
    number: number;
    verseIndex: number;
    updatedAt: string;
  };
};

const KEY = "gys-activity-v1";
const EVENT = "gys-activity-change";
const empty: ActivityState = { version: 1 };

export function getActivity(): ActivityState {
  if (typeof window === "undefined") return empty;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value))
      return empty;
    const parsed = value as Partial<ActivityState>;
    if (parsed.version !== 1) return empty;
    const bible = parsed.bible;
    const hymn = parsed.hymn;
    const validBible =
      bible &&
      typeof bible.book === "string" &&
      bible.book.length > 0 &&
      Number.isInteger(bible.chapter) &&
      bible.chapter > 0 &&
      typeof bible.updatedAt === "string" &&
      !Number.isNaN(Date.parse(bible.updatedAt));
    const validHymn =
      hymn &&
      typeof hymn.id === "string" &&
      hymn.id.length > 0 &&
      typeof hymn.title === "string" &&
      hymn.title.length > 0 &&
      Number.isInteger(hymn.number) &&
      hymn.number > 0 &&
      Number.isInteger(hymn.verseIndex) &&
      hymn.verseIndex >= 0 &&
      typeof hymn.updatedAt === "string" &&
      !Number.isNaN(Date.parse(hymn.updatedAt));
    return {
      version: 1,
      ...(validBible ? { bible } : {}),
      ...(validHymn ? { hymn } : {}),
    };
  } catch {
    return empty;
  }
}

function save(next: ActivityState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function setBibleActivity(book: string, chapter: number) {
  const previous = getActivity().bible;
  if (
    previous?.book === book &&
    previous.chapter === chapter &&
    Date.now() - Date.parse(previous.updatedAt) < 2_000
  )
    return;
  save({
    ...getActivity(),
    version: 1,
    bible: { book, chapter, updatedAt: new Date().toISOString() },
  });
}

export function setHymnActivity(
  item: { id: string; title: string; number: number },
  verseIndex = 0,
) {
  const previous = getActivity().hymn;
  if (
    previous?.id === item.id &&
    previous.verseIndex === verseIndex &&
    Date.now() - Date.parse(previous.updatedAt) < 2_000
  )
    return;
  save({
    ...getActivity(),
    version: 1,
    hymn: { ...item, verseIndex, updatedAt: new Date().toISOString() },
  });
}

export function subscribeActivity(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function activitySnapshot() {
  return getActivity();
}
