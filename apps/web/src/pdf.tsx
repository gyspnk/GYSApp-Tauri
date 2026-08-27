import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type TouchEvent,
  type WheelEvent as ReactWheelEvent,
  type RefObject,
} from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from "pdfjs-dist";
import { workerSrc } from "./pdf-worker.js";
import {
  clampPdfZoomPercent,
  cleanupPdfPage,
  disposePdfDocument,
  isPdfLayout,
  pdfDocumentSourceOptions,
  pdfPageWindow,
  pdfLayoutForViewport,
  pdfPercentScale,
  shouldRenderPdfPage,
  type PdfLayout,
} from "./pdf-utils.js";
import { recordDiagnostic } from "./diagnostics.js";
import { hapticTick } from "./haptics.js";
import { useReadingToolbarAutoHide } from "./use-toolbar-auto-hide.js";
import { readHymnViewerPrefs } from "./hymn-viewer-prefs.js";

GlobalWorkerOptions.workerSrc = workerSrc;

export type PdfChordOverlayMarker = {
  noteIdx: number;
  chord: string;
  xPct: number;
  yPct: number;
};

function PdfChordLayer({
  markers,
  visible,
  editorEnabled = false,
  onEditChord,
}: {
  markers: PdfChordOverlayMarker[] | undefined;
  visible: boolean;
  editorEnabled?: boolean;
  onEditChord?: (noteIdx: number, current: string) => void;
}) {
  if (!visible || !markers?.length) return null;
  if (editorEnabled && onEditChord) {
    // gyschordweb note-aligned editor: every chord marker is a clickable note
    // target that prompts for a replacement chord.
    const targetLabel = (marker: PdfChordOverlayMarker) =>
      marker.noteIdx < 0 ? "▸" : marker.noteIdx > 50_000 ? "◂" : "•";
    return (
      <div className="pdf-chord-layer is-editor" aria-label="Editor chord">
        {markers.map((marker) => (
          <button
            type="button"
            className="note-target"
            key={`${marker.noteIdx}-${marker.xPct}-${marker.yPct}`}
            style={{ left: `${marker.xPct}%`, top: `${marker.yPct}%` }}
            data-note-index={marker.noteIdx}
            title={`Chord ${marker.chord} - klik untuk edit`}
            onClick={() => onEditChord(marker.noteIdx, marker.chord)}
          >
            {targetLabel(marker)}
          </button>
        ))}
        <span className="pdf-editor-hint">
          Klik penanda untuk mengedit chord
        </span>
      </div>
    );
  }
  return (
    <div className="pdf-chord-layer" aria-label="Chord overlay">
      {markers.map((marker) => (
        <span
          className="pdf-chord-marker"
          key={`${marker.noteIdx}-${marker.xPct}-${marker.yPct}`}
          style={{ left: `${marker.xPct}%`, top: `${marker.yPct}%` }}
          data-note-index={marker.noteIdx}
        >
          {marker.chord}
        </span>
      ))}
    </div>
  );
}

export { clampPdfZoom, nextPdfPage } from "./pdf-utils.js";

function readPdfLayout(
  progressKey: string | undefined,
  fallback: PdfLayout = "single",
): PdfLayout {
  if (!progressKey || typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(`gys-pdf-layout:${progressKey}`);
    return isPdfLayout(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

function readPdfPage(progressKey: string | undefined): number | undefined {
  if (!progressKey || typeof window === "undefined") return undefined;
  try {
    const stored = Number(
      window.localStorage.getItem(`gys-pdf-page:${progressKey}`),
    );
    return Number.isInteger(stored) && stored > 0 ? stored : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Render one page in the long-scroll mode used by GYSChordWeb.
 *
 * Pages stay as lightweight placeholders until they are close to the
 * viewport. This preserves the familiar continuous reader without decoding
 * an entire hymnal into canvases (which is especially expensive on mobile).
 */
function VerticalPdfPage({
  documentProxy,
  pageNumber,
  zoomPercent,
  baseScale,
  stageRef,
  onActive,
  chordMarkers,
  chordsVisible,
  editorEnabled = false,
  onEditChord,
  horizontal = false,
}: {
  documentProxy: PDFDocumentProxy;
  pageNumber: number;
  zoomPercent: number;
  baseScale: number | undefined;
  stageRef: RefObject<HTMLDivElement | null>;
  onActive: (page: number) => void;
  chordMarkers?: PdfChordOverlayMarker[];
  chordsVisible: boolean;
  editorEnabled?: boolean;
  onEditChord?: (noteIdx: number, current: string) => void;
  horizontal?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nearViewport, setNearViewport] = useState(() =>
    shouldRenderPdfPage(pageNumber, false),
  );
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    pageNumber <= 2 ? "loading" : "idle",
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const isNearViewport = entries.some((entry) => entry.isIntersecting);
        setNearViewport(isNearViewport);
        setStatus((current) => (isNearViewport ? current : "idle"));
        if (isNearViewport) {
          onActive(pageNumber);
        }
      },
      {
        root: stageRef.current,
        rootMargin: "720px 720px",
        threshold: 0.01,
      },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [onActive, pageNumber, stageRef]);

  useEffect(() => {
    if (!nearViewport || !canvasRef.current || !hostRef.current) return;
    let disposed = false;
    let renderTask: ReturnType<PDFPageProxy["render"]> | undefined;
    let pdfPage: PDFPageProxy | undefined;
    setStatus("loading");
    void documentProxy
      .getPage(pageNumber)
      .then((nextPage) => {
        pdfPage = nextPage;
        if (disposed || !canvasRef.current || !hostRef.current) {
          // getPage() can resolve after the effect cleanup ran. Release the
          // page immediately in that race instead of retaining its operator
          // list until the whole PDF document is destroyed.
          cleanupPdfPage(nextPage);
          return;
        }
        const baseViewport = nextPage.getViewport({ scale: 1 });
        const availableWidth = Math.max(320, hostRef.current.clientWidth - 32);
        const fitScale = availableWidth / baseViewport.width;
        const scale = pdfPercentScale(zoomPercent, fitScale, baseScale);
        const dpr =
          typeof window !== "undefined" && window.devicePixelRatio
            ? window.devicePixelRatio
            : 1;
        const viewport = nextPage.getViewport({
          scale: Math.max(0.08, scale * dpr),
        });
        const canvas = canvasRef.current;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;
        renderTask = nextPage.render({
          canvas,
          canvasContext: canvas.getContext("2d")!,
          viewport,
        });
        return renderTask.promise;
      })
      .then(() => {
        if (!disposed) setStatus("ready");
      })
      .catch((error: unknown) => {
        if (!disposed) setStatus("error");
        if (!disposed) recordDiagnostic("error", "pdf.page", error);
      });
    return () => {
      disposed = true;
      renderTask?.cancel();
      cleanupPdfPage(pdfPage);
      if (canvasRef.current) {
        canvasRef.current.width = 0;
        canvasRef.current.height = 0;
      }
    };
  }, [
    documentProxy,
    zoomPercent,
    baseScale,
    horizontal,
    nearViewport,
    pageNumber,
  ]);

  return (
    <div
      className={`${horizontal ? "pdf-horizontal-page" : "pdf-vertical-page"}${status === "ready" ? " is-ready" : ""}`}
      data-pdf-page={pageNumber}
      ref={hostRef}
      tabIndex={0}
      aria-label={`PDF page ${pageNumber}`}
      onFocus={() => onActive(pageNumber)}
    >
      <div className="pdf-page-frame">
        <canvas
          ref={canvasRef}
          aria-hidden={status !== "ready"}
          data-pdf-rendered={status === "ready" ? "true" : "false"}
        />
        <PdfChordLayer
          markers={chordMarkers}
          visible={chordsVisible}
          editorEnabled={editorEnabled}
          {...(onEditChord
            ? {
                onEditChord: (noteIdx, current) =>
                  onEditChord(noteIdx, current),
              }
            : {})}
        />
      </div>
      {status !== "ready" && (
        <span className="pdf-page-placeholder" aria-live="polite">
          {status === "error"
            ? "Halaman gagal dimuat"
            : `Halaman ${pageNumber}`}
        </span>
      )}
    </div>
  );
}

export function PdfReader({
  src,
  data,
  initialPage = 1,
  pageRange,
  downloadUrl,
  title = "PDF reader",
  progressKey,
  onPageChange,
  chordOverlays,
  chordsVisible = false,
  variant = "default",
  editorEnabled = false,
  onEditChord,
}: {
  src: string;
  data?: Uint8Array;
  initialPage?: number;
  pageRange?: { start: number; count: number };
  downloadUrl?: string;
  title?: string;
  progressKey?: string;
  onPageChange?: (page: number, totalPages: number) => void;
  chordOverlays?: Record<string, PdfChordOverlayMarker[]>;
  chordsVisible?: boolean;
  variant?: "default" | "hymn";
  editorEnabled?: boolean;
  onEditChord?: (pageKey: string, noteIdx: number, current: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const secondaryCanvasRef = useRef<HTMLCanvasElement>(null);
  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy | null>(
    null,
  );
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [page, setPage] = useState(() => {
    return readPdfPage(progressKey) ?? initialPage;
  });
  const [resumePage, setResumePage] = useState<number | undefined>(() =>
    readPdfPage(progressKey),
  );
  const [total, setTotal] = useState(0);
  const [pageStart, setPageStart] = useState(() =>
    Math.max(1, pageRange?.start ?? 1),
  );
  const [zoomPercent, setZoomPercent] = useState(100);
  const [advancedOpen, setAdvancedOpen] = useState(variant === "hymn");
  const viewerPrefs = useMemo(() => readHymnViewerPrefs(), []);
  const defaultLayout: PdfLayout = viewerPrefs.defaultTwoPage
    ? "two"
    : viewerPrefs.defaultVerticalScroll
      ? "vertical"
      : "single";
  const [layout, setLayout] = useState<PdfLayout>(() =>
    readPdfLayout(progressKey, defaultLayout),
  );
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1024 : window.innerWidth,
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [loadProgress, setLoadProgress] = useState(0);
  const [stageState, setStageState] = useState<{
    centered: boolean;
    overflowing: boolean;
  }>({ centered: false, overflowing: false });
  const verticalStageRef = useRef<HTMLDivElement>(null);
  const pdfStageRef = useRef<HTMLDivElement>(null);
  const hydratingLayout = useRef(true);
  const initialScaleRef = useRef<number | undefined>(undefined);
  const zoomAnchorRef = useRef<{ x: number; y: number } | undefined>(undefined);
  const pinchStart = useRef<
    { distance: number; zoomPercent: number } | undefined
  >(undefined);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(
    null,
  );
  const touchStartSingle = useRef<{
    x: number;
    y: number;
    time: number;
  } | null>(null);
  const zoomIndicatorLastTap = useRef<
    { time: number; x: number; y: number } | undefined
  >(undefined);
  const { toolbarVisible, restoreToolbar } = useReadingToolbarAutoHide();
  const effectiveLayout = pdfLayoutForViewport(layout, viewportWidth);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    hydratingLayout.current = true;
    setLayout(readPdfLayout(progressKey, defaultLayout));
  }, [progressKey, defaultLayout]);

  useEffect(() => {
    if (!progressKey) return;
    if (hydratingLayout.current) {
      hydratingLayout.current = false;
      return;
    }
    try {
      window.localStorage.setItem(`gys-pdf-layout:${progressKey}`, layout);
    } catch {
      // A storage quota/private-mode failure should not block the reader.
    }
  }, [layout, progressKey]);

  useEffect(() => {
    if (!progressKey) return;
    const saved = readPdfPage(progressKey);
    setResumePage(saved);
    setPage(saved ?? initialPage);
  }, [initialPage, progressKey]);

  // gyschordweb parity: a fit ("page-fit") reset recalculates the initial
  // scale, and zooming keeps the anchor content point stable on screen.
  useEffect(() => {
    if (zoomPercent === 100) initialScaleRef.current = undefined;
  }, [zoomPercent, layout, effectiveLayout]);

  // gyschordweb updateCenteringAndOverflow: only-vertical-centered page when
  // shorter than the stage, is-overflowing when wider than the stage.
  useEffect(() => {
    const stage = pdfStageRef.current;
    if (!stage || status !== "ready") return;
    const update = () => {
      const centered = stage.scrollHeight <= stage.clientHeight + 4;
      const overflowing = stage.scrollWidth > stage.clientWidth + 4;
      setStageState((current) =>
        current.centered === centered && current.overflowing === overflowing
          ? current
          : { centered, overflowing },
      );
    };
    update();
    const frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [status, zoomPercent, layout, effectiveLayout, page, total]);

  // gyschordweb handleGlobalKeydown: viewer keyboard shortcuts.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      )
        return;
      if (status !== "ready") return;
      if (event.ctrlKey || event.metaKey) {
        if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          setZoomPercent((value) => clampPdfZoomPercent(value + 25));
        } else if (event.key === "-") {
          event.preventDefault();
          setZoomPercent((value) => clampPdfZoomPercent(value - 25));
        }
        return;
      }
      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          goToPage(page - (effectiveLayout === "two" ? 2 : 1));
          break;
        case "ArrowDown":
          event.preventDefault();
          goToPage(page + (effectiveLayout === "two" ? 2 : 1));
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [status, page, effectiveLayout]);

  useEffect(() => {
    if (!documentProxy || !zoomAnchorRef.current) return;
    if (zoomPercent === 100) return;
    const anchor = zoomAnchorRef.current;
    const restore = () => {
      const stage = pdfStageRef.current;
      if (!stage) return;
      const initial = initialScaleRef.current;
      if (typeof initial !== "number") return;
      const maxX = Math.max(0, stage.scrollWidth - stage.clientWidth);
      const maxY = Math.max(0, stage.scrollHeight - stage.clientHeight);
      stage.scrollLeft = Math.min(maxX, anchor.x * stage.scrollWidth);
      stage.scrollTop = Math.min(maxY, anchor.y * stage.scrollHeight);
    };
    const frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [documentProxy, zoomPercent, page]);

  useEffect(() => {
    if (!progressKey || !total) return;
    try {
      window.localStorage.setItem(`gys-pdf-page:${progressKey}`, String(page));
    } catch {
      // A private-mode/quota failure must not make the reader unusable.
    }
  }, [page, progressKey, total]);

  useEffect(() => {
    if (total > 0) onPageChange?.(page, total);
  }, [onPageChange, page, total]);

  useEffect(() => {
    let disposed = false;
    const previousDocument = documentRef.current;
    documentRef.current = null;
    void disposePdfDocument(previousDocument);
    setDocumentProxy(null);
    setTotal(0);
    setPageStart(Math.max(1, pageRange?.start ?? 1));
    setStatus("loading");
    const cleanup = () => {
      disposed = true;
      const loadedDocument = documentRef.current;
      documentRef.current = null;
      void disposePdfDocument(loadedDocument);
      setDocumentProxy(null);
    };
    if (!src && !data) {
      setStatus("error");
      return cleanup;
    }
    const loadingTask = getDocument(pdfDocumentSourceOptions(src, data));
    setLoadProgress(8);
    // gyschordweb viewer-loader 0-100% progress via onProgress
    (
      loadingTask as unknown as {
        onProgress?: (p: { loaded: number; total: number }) => void;
      }
    ).onProgress = (progress: { loaded: number; total: number }) => {
      if (disposed) return;
      const pct =
        progress.total > 0
          ? Math.round((progress.loaded / progress.total) * 100)
          : 0;
      setLoadProgress(Math.max(8, Math.min(96, pct)));
    };
    void loadingTask.promise
      .then((document) => {
        if (disposed) {
          void disposePdfDocument(document);
          return;
        }
        const pageWindow = pdfPageWindow(
          pageRange?.start ?? 1,
          pageRange?.count,
          document.numPages,
        );
        documentRef.current = document;
        setPageStart(pageWindow.start);
        setTotal(pageWindow.total);
        setPage((current) =>
          Math.max(pageWindow.start, Math.min(pageWindow.end, current)),
        );
        setResumePage((current) =>
          current === undefined
            ? current
            : Math.max(pageWindow.start, Math.min(pageWindow.end, current)),
        );
        setDocumentProxy(document);
        setLoadProgress(100);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (!disposed) setStatus("error");
        if (!disposed) recordDiagnostic("error", "pdf.document", error);
      });
    return () => {
      void loadingTask.destroy().catch(() => undefined);
      cleanup();
    };
  }, [data, loadAttempt, pageRange?.count, pageRange?.start, src]);

  const onStageTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    restoreToolbar();
    if (event.touches.length === 2) {
      touchStartSingle.current = null;
      const [first, second] = [event.touches[0], event.touches[1]];
      if (!first || !second) return;
      pinchStart.current = {
        distance: Math.hypot(
          second.clientX - first.clientX,
          second.clientY - first.clientY,
        ),
        zoomPercent,
      };
    } else if (event.touches.length === 1) {
      const touch = event.touches[0];
      if (touch) {
        touchStartSingle.current = {
          x: touch.clientX,
          y: touch.clientY,
          time: Date.now(),
        };
      }
    }
  };
  const onStageTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2 || !pinchStart.current) return;
    const [first, second] = [event.touches[0], event.touches[1]];
    if (!first || !second) return;
    event.preventDefault();
    const distance = Math.hypot(
      second.clientX - first.clientX,
      second.clientY - first.clientY,
    );
    setZoomPercent(
      clampPdfZoomPercent(
        pinchStart.current.zoomPercent *
          (distance / pinchStart.current.distance),
      ),
    );
  };
  /** gyschordweb parity: wheel zoom (±25%), anchored at cursor, single/two only. */
  const onStageWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (effectiveLayout !== "single" && effectiveLayout !== "two") return;
    const zooming = event.ctrlKey || event.metaKey;
    // Without a modifier the wheel pans vertically when zoomed past fit.
    if (!zooming && zoomPercent === 100) return;
    event.preventDefault();
    const stage = pdfStageRef.current;
    if (stage) {
      zoomAnchorRef.current = {
        x:
          (event.clientX - stage.getBoundingClientRect().left) /
          stage.clientWidth,
        y:
          (event.clientY - stage.getBoundingClientRect().top) /
          stage.clientHeight,
      };
    }
    setZoomPercent((current) =>
      clampPdfZoomPercent(current + (event.deltaY > 0 ? -25 : 25)),
    );
  };
  const onStageTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    pinchStart.current = undefined;
    if (touchStartSingle.current && event.changedTouches.length === 1) {
      const touch = event.changedTouches[0];
      if (!touch) return;
      const deltaX = touch.clientX - touchStartSingle.current.x;
      const deltaY = touch.clientY - touchStartSingle.current.y;
      const elapsed = Date.now() - touchStartSingle.current.time;
      const movedDist = Math.hypot(deltaX, deltaY);

      if (movedDist < 15 && elapsed < 350) {
        const now = Date.now();
        const lastTap = lastTapRef.current;
        if (
          lastTap &&
          now - lastTap.time < 350 &&
          Math.hypot(touch.clientX - lastTap.x, touch.clientY - lastTap.y) < 30
        ) {
          hapticTick("light");
          lastTapRef.current = null;
          // gyschordweb double-tap parity: back to fit or zoom in (≈180%)
          if (zoomPercent > 100) setZoomPercent(100);
          else setZoomPercent(180);
          touchStartSingle.current = null;
          return;
        } else {
          lastTapRef.current = {
            time: now,
            x: touch.clientX,
            y: touch.clientY,
          };
        }
      }

      if (
        (effectiveLayout === "single" || effectiveLayout === "two") &&
        Math.abs(deltaX) > 50 &&
        Math.abs(deltaX) > Math.abs(deltaY) * 1.5 &&
        elapsed < 500
      ) {
        if (deltaX < 0 && (total === 0 || page < pageStart + total - 1)) {
          hapticTick("light");
          goToPage(page + (effectiveLayout === "two" ? 2 : 1));
        } else if (deltaX > 0 && page > pageStart) {
          hapticTick("light");
          goToPage(page + (effectiveLayout === "two" ? -2 : -1));
        }
      }
      touchStartSingle.current = null;
    }
  };

  useEffect(() => {
    if (!documentProxy || !canvasRef.current) return;
    if (effectiveLayout === "vertical" || effectiveLayout === "horizontal")
      return;
    let disposed = false;
    const renderTasks: Array<ReturnType<PDFPageProxy["render"]>> = [];
    const pdfPages: PDFPageProxy[] = [];
    const pageNumbers =
      effectiveLayout === "single"
        ? [page]
        : [page, page + 1].filter((value) => value <= pageStart + total - 1);
    const canvases = [canvasRef.current, secondaryCanvasRef.current];
    const stageBox = pdfStageRef.current;
    const stageWidth = stageBox?.clientWidth ?? window.innerWidth;
    const stageHeight = stageBox?.clientHeight ?? window.innerHeight;
    void Promise.all(
      pageNumbers.map(async (pageNumber, index) => {
        const canvas = canvases[index];
        if (!canvas) return;
        const pdfPage = await documentProxy.getPage(
          Math.max(pageStart, Math.min(pageStart + total - 1, pageNumber)),
        );
        if (disposed) {
          cleanupPdfPage(pdfPage);
          return;
        }
        pdfPages.push(pdfPage);
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const availableWidth = Math.max(320, stageWidth - 32);
        const fitWidth = availableWidth / baseViewport.width;
        const fitHeight = Math.max(120, stageHeight - 32) / baseViewport.height;
        // gyschordweb page-fit: single/two fits both axes; vertical fits width.
        const fitScale =
          effectiveLayout === "single"
            ? Math.min(fitWidth, fitHeight)
            : fitWidth;
        if (zoomPercent === 100) initialScaleRef.current = fitScale;
        const scale = pdfPercentScale(
          zoomPercent,
          fitScale,
          initialScaleRef.current,
        );
        const dpr =
          typeof window !== "undefined" && window.devicePixelRatio
            ? window.devicePixelRatio
            : 1;
        const viewport = pdfPage.getViewport({
          scale: Math.max(0.08, scale * dpr),
        });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        // CSS size keeps the page at its logical scale (dpr-aware rendering).
        canvas.style.width = `${viewport.width / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;
        const renderTask = pdfPage.render({
          canvas,
          canvasContext: canvas.getContext("2d")!,
          viewport,
        });
        renderTasks.push(renderTask);
        await renderTask.promise;
      }),
    )
      .then(() => {
        if (!disposed) setStatus("ready");
      })
      .catch((error: unknown) => {
        if (!disposed) setStatus("error");
        if (!disposed) recordDiagnostic("error", "pdf.page", error);
      });
    return () => {
      disposed = true;
      for (const renderTask of renderTasks) renderTask.cancel();
      for (const pdfPage of pdfPages) cleanupPdfPage(pdfPage);
      if (secondaryCanvasRef.current) secondaryCanvasRef.current.width = 0;
    };
  }, [documentProxy, effectiveLayout, page, pageStart, total, zoomPercent]);

  const goToPage = (next: number) => {
    const bounded = Math.max(
      pageStart,
      Math.min(pageStart + Math.max(0, total - 1), Math.trunc(next)),
    );
    setPage(bounded);
    if (effectiveLayout !== "vertical" && effectiveLayout !== "horizontal")
      return;
    const target = verticalStageRef.current?.querySelector<HTMLElement>(
      `[data-pdf-page="${bounded}"]`,
    );
    target?.scrollIntoView({
      behavior: "smooth",
      block: effectiveLayout === "vertical" ? "start" : "nearest",
      inline: effectiveLayout === "horizontal" ? "center" : "nearest",
    });
  };
  const canResume =
    total > 0 &&
    resumePage !== undefined &&
    resumePage !== page &&
    resumePage >= pageStart &&
    resumePage <= pageStart + total - 1;
  const retry = () => {
    setStatus("loading");
    setLoadAttempt((attempt) => attempt + 1);
  };

  return (
    <section
      className={`pdf-reader${variant === "hymn" ? " pdf-reader-hymn" : ""}`}
      aria-label={title}
    >
      <div className={`pdf-toolbar${toolbarVisible ? "" : " is-collapsed"}`}>
        <div className="pdf-page-navigation">
          <button
            type="button"
            onClick={() =>
              goToPage(page + (effectiveLayout === "two" ? -2 : -1))
            }
            disabled={page <= pageStart}
          >
            Sebelumnya
          </button>
          <span>
            Page {pageStart > 1 ? page - pageStart + 1 : page}
            {total ? ` / ${total}` : ""}
          </span>
          {canResume && (
            <button
              className="pdf-resume"
              type="button"
              data-pdf-resume="true"
              onClick={() => goToPage(resumePage)}
            >
              Kembali ke halaman {resumePage}
            </button>
          )}
          {total > 1 && (
            <label className="pdf-page-jump">
              Ke halaman
              <input
                type="number"
                min={pageStart}
                max={pageStart + Math.max(0, total - 1)}
                value={page}
                aria-label="Lompat ke halaman PDF"
                onChange={(event) =>
                  setPage(
                    Math.max(
                      pageStart,
                      Math.min(
                        pageStart + Math.max(0, total - 1),
                        Number(event.target.value) || pageStart,
                      ),
                    ),
                  )
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter")
                    goToPage(Number(event.currentTarget.value) || 1);
                }}
              />
            </label>
          )}
          <button
            type="button"
            onClick={() => goToPage(page + (effectiveLayout === "two" ? 2 : 1))}
            disabled={total === 0 || page >= pageStart + total - 1}
          >
            Berikutnya
          </button>
        </div>
        {variant === "hymn" && total > 1 && (
          <div
            className="pdf-view-scroll-toggle"
            role="group"
            aria-label="Mode tampilan PDF"
          >
            <button
              type="button"
              className={layout === "two" ? "is-active" : ""}
              aria-pressed={layout === "two"}
              onClick={() => setLayout("two")}
              title="Tampilan 2 halaman"
            >
              2 pg
            </button>
            <button
              type="button"
              className={layout === "single" ? "is-active" : ""}
              aria-pressed={layout === "single"}
              onClick={() => setLayout("single")}
              title="Tampilan 1 halaman"
            >
              1 pg
            </button>
            <button
              type="button"
              className={layout === "vertical" ? "is-active" : ""}
              aria-pressed={layout === "vertical"}
              onClick={() => setLayout("vertical")}
              title="Gulir vertikal"
            >
              ↓
            </button>
            <button
              type="button"
              className={layout === "horizontal" ? "is-active" : ""}
              aria-pressed={layout === "horizontal"}
              onClick={() => setLayout("horizontal")}
              title="Gulir mendatar"
            >
              →
            </button>
          </div>
        )}
        {variant === "hymn" && (
          <button
            className="pdf-advanced-toggle"
            type="button"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((value) => !value)}
          >
            {advancedOpen ? "Tutup alat PDF" : "Pengaturan PDF"}
          </button>
        )}
        <div
          className={`pdf-advanced-controls${advancedOpen ? " is-open" : ""}`}
        >
          <div className="pdf-zoom-controls" role="group" aria-label="Zoom PDF">
            <button
              type="button"
              onClick={() =>
                setZoomPercent((value) => clampPdfZoomPercent(value - 25))
              }
              disabled={zoomPercent <= 100}
              aria-label="Perkecil zoom"
            >
              −
            </button>
            <button
              type="button"
              className="pdf-zoom-indicator"
              data-pdf-zoom-indicator="true"
              title="Klik dua kali untuk reset ke 100%"
              onDoubleClick={() => setZoomPercent(100)}
              onTouchEnd={(event) => {
                // Double-tap on the indicator resets zoom (gyschordweb parity)
                const touch = event.changedTouches[0];
                if (!touch) return;
                const now = Date.now();
                const last = zoomIndicatorLastTap.current;
                if (
                  last &&
                  now - last.time < 350 &&
                  Math.hypot(touch.clientX - last.x, touch.clientY - last.y) <
                    40
                ) {
                  setZoomPercent(100);
                  zoomIndicatorLastTap.current = undefined;
                } else {
                  zoomIndicatorLastTap.current = {
                    time: now,
                    x: touch.clientX,
                    y: touch.clientY,
                  };
                }
              }}
            >
              {zoomPercent}%
            </button>
            <button
              type="button"
              onClick={() =>
                setZoomPercent((value) => clampPdfZoomPercent(value + 25))
              }
              disabled={zoomPercent >= 800}
              aria-label="Perbesar zoom"
            >
              +
            </button>
            <button
              type="button"
              className="pdf-zoom-reset"
              onClick={() => setZoomPercent(100)}
              disabled={zoomPercent === 100}
            >
              Reset
            </button>
          </div>
          <label>
            Zoom{" "}
            <input
              type="range"
              min="100"
              max="800"
              step="25"
              value={zoomPercent}
              onChange={(event) =>
                setZoomPercent(clampPdfZoomPercent(Number(event.target.value)))
              }
            />
          </label>
          <div
            className="pdf-layout-toggle"
            role="group"
            aria-label="Layout PDF"
          >
            {(["single", "two", "vertical", "horizontal"] as const).map(
              (value) => (
                <button
                  key={value}
                  type="button"
                  className={layout === value ? "is-active" : ""}
                  onClick={() => setLayout(value)}
                  aria-pressed={layout === value}
                >
                  {value === "single"
                    ? "1 halaman"
                    : value === "two"
                      ? "2 halaman"
                      : value === "vertical"
                        ? "Vertikal"
                        : "Mendatar"}
                </button>
              ),
            )}
          </div>
          {layout === "two" && effectiveLayout === "single" && (
            <small className="pdf-layout-note">
              Tampilan 2 halaman dialihkan ke 1 halaman pada layar sempit.
            </small>
          )}
          {downloadUrl && (
            <a
              className="pdf-download"
              href={downloadUrl}
              download={`${title}.pdf`}
            >
              Unduh
            </a>
          )}
        </div>
      </div>
      <div
        className={`pdf-stage${stageState.centered ? " is-centered" : ""}${stageState.overflowing ? " is-overflowing" : ""}`}
        data-pdf-layout={effectiveLayout}
        ref={pdfStageRef}
        style={{ "--pdf-chord-scale": `${zoomPercent / 100}` } as CSSProperties}
        onTouchStart={onStageTouchStart}
        onTouchMove={onStageTouchMove}
        onTouchEnd={onStageTouchEnd}
        onWheel={onStageWheel}
        onClick={restoreToolbar}
      >
        {status === "loading" && (
          <div
            className="pdf-loading"
            role="status"
            aria-live="polite"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              padding: 16,
            }}
          >
            <p>Memuat PDF… {loadProgress}%</p>
            <div
              style={{
                width: 160,
                height: 4,
                background: "rgba(141,110,63,0.18)",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${loadProgress}%`,
                  height: "100%",
                  background: "var(--accent, #8d6e3f)",
                  transition: "width 0.2s ease",
                }}
              />
            </div>
          </div>
        )}
        {status === "ready" &&
          effectiveLayout === "two" &&
          typeof window !== "undefined" &&
          window.matchMedia?.("(orientation: portrait)").matches && (
            <div
              className="pdf-orientation-warning"
              role="note"
              style={{
                fontSize: "0.75rem",
                opacity: 0.7,
                padding: "4px 8px",
                textAlign: "center",
              }}
            >
              Tampilan 2 halaman lebih nyaman dalam landscape
            </div>
          )}
        {status === "error" && (
          <div className="pdf-error-state" role="alert">
            <p>
              PDF gagal dimuat. PDF belum tersedia offline; simpan dulu saat
              tersambung internet.
            </p>
            <button
              className="quiet-button"
              type="button"
              data-pdf-retry="true"
              onClick={retry}
            >
              Coba lagi
            </button>
          </div>
        )}
        {effectiveLayout === "vertical" || effectiveLayout === "horizontal" ? (
          <div
            className={`pdf-pages pdf-layout-${effectiveLayout}`}
            ref={verticalStageRef}
          >
            {Array.from({ length: total }, (_, index) => {
              const pageNumber = pageStart + index;
              return (
                <VerticalPdfPage
                  key={pageNumber}
                  documentProxy={documentProxy!}
                  pageNumber={pageNumber}
                  zoomPercent={zoomPercent}
                  baseScale={initialScaleRef.current}
                  stageRef={verticalStageRef}
                  onActive={(nextPage) => {
                    setPage((current) =>
                      current === nextPage ? current : nextPage,
                    );
                  }}
                  {...(chordOverlays?.[String(pageNumber)]
                    ? { chordMarkers: chordOverlays[String(pageNumber)] }
                    : {})}
                  chordsVisible={chordsVisible}
                  editorEnabled={editorEnabled}
                  onEditChord={(noteIdx, current) =>
                    onEditChord?.(String(pageNumber), noteIdx, current)
                  }
                  horizontal={effectiveLayout === "horizontal"}
                />
              );
            })}
          </div>
        ) : (
          <div className={`pdf-pages pdf-layout-${effectiveLayout}`}>
            <div className="pdf-page-frame">
              <canvas
                className={zoomPercent === 100 ? "is-fit" : ""}
                ref={canvasRef}
                aria-label={`PDF page ${page}`}
              />
              <PdfChordLayer
                markers={chordOverlays?.[String(page)]}
                visible={chordsVisible}
                editorEnabled={editorEnabled}
                onEditChord={(noteIdx, current) =>
                  onEditChord?.(String(page), noteIdx, current)
                }
              />
            </div>
            <div className="pdf-page-frame">
              <canvas
                className={zoomPercent === 100 ? "is-fit" : ""}
                ref={secondaryCanvasRef}
                aria-label={`PDF page ${page + 1}`}
              />
              <PdfChordLayer
                markers={chordOverlays?.[String(page + 1)]}
                visible={chordsVisible}
                editorEnabled={editorEnabled}
                onEditChord={(noteIdx, current) =>
                  onEditChord?.(String(page + 1), noteIdx, current)
                }
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
