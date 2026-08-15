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
export const MIN_SPLIT_RATIO = 42;
export const MAX_SPLIT_RATIO = 72;
export const DEFAULT_SPLIT_RATIO = 58;

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
  rect: Pick<DOMRect, "left" | "width">,
): number {
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

export type BibleSplitController = {
  splitView: boolean;
  setSplitView: Dispatch<SetStateAction<boolean>>;
  splitRatio: number;
  setSplitRatio: Dispatch<SetStateAction<number>>;
  splitLayoutRef: React.RefObject<HTMLDivElement | null>;
  startSplitDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

/**
 * Owns the Bible split-pane state, persistence, pointer drag lifecycle, and
 * responsive guard. The reader component only consumes the controller so its
 * verse/search logic cannot accidentally leak into the divider implementation.
 */
export function useBibleSplitController(): BibleSplitController {
  const storage = browserStorage();
  const [splitView, setSplitView] = useState(() => readEnabled(storage));
  const [splitRatioState, setSplitRatioState] = useState(() =>
    readStoredSplitRatio(storage),
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

  useEffect(() => {
    storage?.setItem(SPLIT_KEY, splitView ? "1" : "0");
  }, [splitView, storage]);

  useEffect(() => {
    storage?.setItem(SPLIT_RATIO_KEY, String(splitRatioState));
  }, [splitRatioState, storage]);

  useEffect(() => {
    const updateRatio = (event: PointerEvent) => {
      if (!splitDragging.current || !splitLayoutRef.current) return;
      const rect = splitLayoutRef.current.getBoundingClientRect();
      setSplitRatio(splitRatioFromPointer(event.clientX, rect));
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
      if (window.innerWidth <= 720) return;
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
  };
}
