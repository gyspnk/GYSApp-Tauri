import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";

export const SPLIT_KEY = "gys-bible-split-v1";
export const SPLIT_RATIO_KEY = "gys-bible-split-ratio-v1";
export const SPLIT_SYNC_SCROLL_KEY = "gys-bible-split-sync-scroll-v1";
export const MIN_SPLIT_RATIO = 20;
export const MAX_SPLIT_RATIO = 80;
export const DEFAULT_SPLIT_RATIO = 50;
export const DEFAULT_SYNC_SCROLL = true;

export function clampSplitRatio(
  value: number,
  fallback = DEFAULT_SPLIT_RATIO,
): number {
  const safeFallback = Number.isFinite(fallback)
    ? Math.round(fallback)
    : DEFAULT_SPLIT_RATIO;
  if (!Number.isFinite(value))
    return Math.max(MIN_SPLIT_RATIO, Math.min(MAX_SPLIT_RATIO, safeFallback));
  return Math.max(
    MIN_SPLIT_RATIO,
    Math.min(MAX_SPLIT_RATIO, Math.round(value)),
  );
}

export function splitRatioFromPointer(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "width" | "top" | "height">,
  isVertical = false,
): number {
  if (isVertical) {
    if (!Number.isFinite(clientY) || rect.height <= 0)
      return DEFAULT_SPLIT_RATIO;
    return clampSplitRatio(((clientY - rect.top) / rect.height) * 100);
  }
  if (!Number.isFinite(clientX) || rect.width <= 0) return DEFAULT_SPLIT_RATIO;
  return clampSplitRatio(((clientX - rect.left) / rect.width) * 100);
}

export function adjustSplitRatio(current: number, delta: number): number {
  return clampSplitRatio(current + (Number.isFinite(delta) ? delta : 0));
}

function browserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function readEnabled(storage: Storage | undefined): boolean {
  return storage?.getItem(SPLIT_KEY) === "1";
}

export function readStoredSplitRatio(
  storage: Pick<Storage, "getItem"> | undefined,
): number {
  const raw = storage?.getItem(SPLIT_RATIO_KEY);
  const value = raw === null || raw === undefined ? Number.NaN : Number(raw);
  return clampSplitRatio(value);
}

export function readStoredSyncScroll(
  storage: Pick<Storage, "getItem"> | undefined,
  fallback = DEFAULT_SYNC_SCROLL,
): boolean {
  const raw = storage?.getItem(SPLIT_SYNC_SCROLL_KEY);
  if (raw === null || raw === undefined) return fallback;
  return raw === "1" || raw === "true";
}

export function calculateProportionalScroll(
  sourceScrollTop: number,
  sourceScrollHeight: number,
  sourceClientHeight: number,
  targetScrollHeight: number,
  targetClientHeight: number,
): number {
  const maxSource = Math.max(0, sourceScrollHeight - sourceClientHeight);
  const maxTarget = Math.max(0, targetScrollHeight - targetClientHeight);
  if (maxSource <= 0 || maxTarget <= 0) return 0;
  const progress = Math.max(0, Math.min(1, sourceScrollTop / maxSource));
  return Math.round(progress * maxTarget);
}

export function calculateVerseAnchorScroll(
  primaryVerseIndex: number,
  primaryTotalVerses: number,
  secondaryTotalVerses: number,
): number {
  if (primaryTotalVerses <= 0 || secondaryTotalVerses <= 0) return 1;
  const ratio = Math.max(
    0,
    Math.min(1, (primaryVerseIndex - 1) / Math.max(1, primaryTotalVerses - 1)),
  );
  return Math.min(
    secondaryTotalVerses,
    Math.max(1, Math.round(1 + ratio * (secondaryTotalVerses - 1))),
  );
}

export type BibleSplitController = {
  splitView: boolean;
  setSplitView: Dispatch<SetStateAction<boolean>>;
  splitRatio: number;
  setSplitRatio: Dispatch<SetStateAction<number>>;
  splitLayoutRef: React.RefObject<HTMLDivElement | null>;
  startSplitDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  syncScroll: boolean;
  setSyncScroll: Dispatch<SetStateAction<boolean>>;
  toggleSyncScroll: () => void;
};

/**
 * Owns the Bible split-pane state, persistence, pointer drag lifecycle,
 * synchronized scrolling mode, and responsive guard.
 */
export function useBibleSplitController(): BibleSplitController {
  const storage = browserStorage();
  const [splitView, setSplitView] = useState(() => readEnabled(storage));
  const [splitRatioState, setSplitRatioState] = useState(() =>
    readStoredSplitRatio(storage),
  );
  const [syncScroll, setSyncScroll] = useState(() =>
    readStoredSyncScroll(storage),
  );
  const splitLayoutRef = useRef<HTMLDivElement | null>(null);
  const splitDragging = useRef(false);

  const setSplitRatio = useCallback<Dispatch<SetStateAction<number>>>(
    (next) => {
      setSplitRatioState((current) =>
        clampSplitRatio(
          typeof next === "function" ? next(current) : next,
          current,
        ),
      );
    },
    [],
  );

  const toggleSyncScroll = useCallback(() => {
    setSyncScroll((current) => !current);
  }, []);

  useEffect(() => {
    storage?.setItem(SPLIT_KEY, splitView ? "1" : "0");
  }, [splitView, storage]);

  useEffect(() => {
    storage?.setItem(SPLIT_RATIO_KEY, String(splitRatioState));
  }, [splitRatioState, storage]);

  useEffect(() => {
    storage?.setItem(SPLIT_SYNC_SCROLL_KEY, syncScroll ? "1" : "0");
  }, [syncScroll, storage]);

  useEffect(() => {
    const updateRatio = (event: PointerEvent) => {
      if (!splitDragging.current || !splitLayoutRef.current) return;
      const rect = splitLayoutRef.current.getBoundingClientRect();
      const isVertical = window.innerWidth <= 680;
      setSplitRatio(
        splitRatioFromPointer(event.clientX, event.clientY, rect, isVertical),
      );
    };
    const finishDrag = () => {
      splitDragging.current = false;
      document.body.classList.remove("is-resizing-bible");
    };
    window.addEventListener("pointermove", updateRatio);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    return () => {
      window.removeEventListener("pointermove", updateRatio);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
      finishDrag();
    };
  }, [setSplitRatio]);

  const startSplitDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      splitDragging.current = true;
      document.body.classList.add("is-resizing-bible");
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [],
  );

  return {
    splitView,
    setSplitView,
    splitRatio: splitRatioState,
    setSplitRatio,
    splitLayoutRef,
    startSplitDrag,
    syncScroll,
    setSyncScroll,
    toggleSyncScroll,
  };
}
