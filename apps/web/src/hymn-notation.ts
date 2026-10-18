import { useSyncExternalStore } from "react";

export type HymnAccidental = "sharp" | "flat";
const KEY = "gys-hymn-accidental";
const CHANGE = "gys-hymn-notation-change";
let fallback: HymnAccidental = "sharp";
let volatile: HymnAccidental | undefined;

export function readHymnAccidental(): HymnAccidental {
  if (typeof window === "undefined") return "sharp";
  if (volatile) return volatile;
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "flat" ? "flat" : "sharp";
  } catch {
    return fallback;
  }
}

export function setHymnAccidental(
  value: HymnAccidental | ((current: HymnAccidental) => HymnAccidental),
): void {
  const next =
    typeof value === "function" ? value(readHymnAccidental()) : value;
  if (next === readHymnAccidental()) return;
  fallback = next;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, next);
    volatile = undefined;
  } catch {
    volatile = next;
    /* Keep controls usable when storage is unavailable. */
  }
  window.dispatchEvent(new Event(CHANGE));
}

function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) {
      volatile = undefined;
      listener();
    }
  };
  window.addEventListener(CHANGE, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE, listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Reader, PDF, dock and fullscreen observe the same notation preference. */
export function useHymnNotation(): readonly [
  HymnAccidental,
  typeof setHymnAccidental,
] {
  return [
    useSyncExternalStore(subscribe, readHymnAccidental, () => "sharp" as const),
    setHymnAccidental,
  ];
}
