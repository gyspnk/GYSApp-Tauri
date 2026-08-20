import { useSyncExternalStore } from "react";
import type { PointerEvent, KeyboardEvent } from "react";

export type BibleHeaderActionProps = {
  active: boolean;
  bookName: string;
  chapter: number;
  totalChapters: number;
  verseCount: number;
  versionCode: string;
  versionOptions: { value: string; label: string; shortLabel?: string }[];
  onSelectVersion: (version: string) => void;
  onOpenPicker: () => void;
  startQuickNav?: (event: PointerEvent<HTMLElement>) => void;
  quickNavKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  // Typography
  fontSize: number;
  minFontSize: number;
  maxFontSize: number;
  onIncreaseFontSize: () => void;
  onDecreaseFontSize: () => void;
  // Split view
  splitView: boolean;
  onToggleSplitView: () => void;
  secondaryVersionCode?: string;
  onSelectSecondaryVersion?: (version: string) => void;
  syncScroll: boolean;
  onToggleSyncScroll: () => void;
  // Speech / Read aloud
  speechAvailable: boolean;
  speaking: boolean;
  speechStatus: "idle" | "loading" | "speaking" | "paused" | "error";
  onToggleSpeech: () => void;
  speechControlsOpen: boolean;
  onToggleSpeechControls: () => void;
  // Copy
  copied: boolean;
  onCopyChapter: () => void;
  // Search
  onFocusSearch: () => void;
};

let currentBibleHeaderState: BibleHeaderActionProps | null = null;
const listeners = new Set<() => void>();

export function setBibleHeaderState(state: BibleHeaderActionProps | null) {
  currentBibleHeaderState = state;
  listeners.forEach((listener) => listener());
}

export function getBibleHeaderState(): BibleHeaderActionProps | null {
  return currentBibleHeaderState;
}

export function subscribeBibleHeaderState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useBibleHeaderState(): BibleHeaderActionProps | null {
  return useSyncExternalStore(
    subscribeBibleHeaderState,
    getBibleHeaderState,
    getBibleHeaderState,
  );
}
