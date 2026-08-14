export type FavoriteKind = "hymn" | "literature";

export type FavoriteItem = {
  id: string;
  kind: FavoriteKind;
  title: string;
  updatedAt: string;
};

type FavoriteState = {
  version: 1;
  items: FavoriteItem[];
};

const KEY = "gys-favorites-v1";
const EVENT = "gys-favorites-change";
const EMPTY: FavoriteState = { version: 1, items: [] };

function read(): FavoriteState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const value = JSON.parse(
      localStorage.getItem(KEY) ?? "null",
    ) as Partial<FavoriteState> | null;
    if (value?.version !== 1 || !Array.isArray(value.items)) return EMPTY;
    return {
      version: 1,
      items: value.items.filter((item): item is FavoriteItem =>
        Boolean(
          item &&
          typeof item === "object" &&
          typeof (item as FavoriteItem).id === "string" &&
          (item as FavoriteItem).kind !== undefined &&
          typeof (item as FavoriteItem).title === "string" &&
          typeof (item as FavoriteItem).updatedAt === "string",
        ),
      ),
    };
  } catch {
    return EMPTY;
  }
}

function write(next: FavoriteState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function getFavorites(): FavoriteItem[] {
  return read().items;
}

export function isFavorite(kind: FavoriteKind, id: string): boolean {
  return read().items.some((item) => item.kind === kind && item.id === id);
}

export function toggleFavorite(item: Omit<FavoriteItem, "updatedAt">): boolean {
  const current = read().items;
  const exists = current.some(
    (candidate) => candidate.kind === item.kind && candidate.id === item.id,
  );
  const next = exists
    ? current.filter(
        (candidate) =>
          !(candidate.kind === item.kind && candidate.id === item.id),
      )
    : [...current, { ...item, updatedAt: new Date().toISOString() }];
  write({ version: 1, items: next });
  return !exists;
}

export function subscribeFavorites(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
