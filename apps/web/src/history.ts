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
    const parsed = JSON.parse(
      localStorage.getItem(KEY) ?? "null",
    ) as Partial<ActivityState> | null;
    return parsed?.version === 1 ? { ...empty, ...parsed } : empty;
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
