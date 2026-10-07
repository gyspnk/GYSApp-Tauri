import { LoadingProgress } from "./loading-progress.js";
import { useReadinessMarker } from "./readiness.js";
import { enhancePdfReader } from "./direct-manipulation.js";
import {
  installPdfZoom,
  sizePdfCanvas,
  type PdfZoomController,
} from "./pdf-zoom.js";
import { PdfDetailLayer } from "./pdf-detail-layer.js";
import { transitionReader } from "./reader-transition.js";
import { useMenuPresence } from "./use-menu-presence.js";
import {
  useCallback,
  useId,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent,
  type RefObject,
} from "react";
import { type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist";
import { pdfDocuments } from "./pdf-document-cache.js";
import {
  clampPdfZoomPercent,
  cleanupPdfPage,
  isPdfLayout,
  pdfHttpStatus,
  pdfPageWindow,
  pdfLayoutForViewport,
  pdfPercentScale,
  pdfRasterScale,
  pdfFitScale,
  shouldRenderPdfPage,
  type PdfLayout,
} from "./pdf-utils.js";
import { recordDiagnostic } from "./diagnostics.js";
import { hapticTick } from "./haptics.js";
import { useReadingToolbarAutoHide } from "./use-toolbar-auto-hide.js";
import { readHymnViewerPrefs } from "./hymn-viewer-prefs.js";
import {
  chordFillColor,
  chordTextColor,
  readChordUiPrefs,
  subscribeChordUiPrefs,
} from "./chord-ui-prefs.js";
import { getAccentColor, subscribeAccentColor } from "./accent-color.js";
import { Icon } from "./icons.js";
import { translate, type Locale } from "./i18n.js";

const PDF_SLOW_LOAD_DELAY_MS = 2500;

export type PdfChordOverlayMarker = {
  noteIdx: number;
  chord: string;
  xPct: number;
  yPct: number;
};

function PdfChordLayer({
  markers,
  visible,
  locale,
  editorEnabled = false,
  onEditChord,
}: {
  markers: PdfChordOverlayMarker[] | undefined;
  visible: boolean;
  locale: Locale;
  editorEnabled?: boolean;
  onEditChord?: (noteIdx: number, current: string) => void;
}) {
  const [chordUiPrefs, setChordUiPrefs] = useState(() => readChordUiPrefs());
  const [accent, setAccent] = useState(() => getAccentColor());
  useEffect(
    () => subscribeChordUiPrefs(() => setChordUiPrefs(readChordUiPrefs())),
    [],
  );
  useEffect(() => subscribeAccentColor(() => setAccent(getAccentColor())), []);
  if (!markers?.length) return null;
  const textColor = chordTextColor(chordUiPrefs, accent);
  const fillColor = chordFillColor(chordUiPrefs, accent);
  const fillStyle =
    chordUiPrefs.fill === "none"
      ? "transparent"
      : `color-mix(in srgb, ${fillColor} ${
          chordUiPrefs.fill === "solid" ? "65%" : "32%"
        }, #ffffff)`;
  const chordStyle = {
    "--chord-text-color": textColor,
    "--chord-fill-background": fillStyle,
    "--chord-fill-opacity": `${chordUiPrefs.fillOpacityPercent}%`,
    "--chord-font-scale": chordUiPrefs.fontOverridePercent / 100,
    "--chord-fill-padding-scale": chordUiPrefs.fillPaddingPercent / 100,
  } as React.CSSProperties;
  if (editorEnabled && onEditChord) {
    // gyschordweb note-aligned editor: every chord marker is a clickable note
    // target that prompts for a replacement chord.
    const targetLabel = (marker: PdfChordOverlayMarker) =>
      marker.noteIdx < 0 ? "▸" : marker.noteIdx > 50_000 ? "◂" : "•";
    return (
      <div
        className="pdf-chord-layer is-editor"
        aria-label={translate(locale, "pdf.chordEditor")}
        style={chordStyle}
      >
        {markers.map((marker) => (
          <button
            type="button"
            className="note-target"
            key={`${marker.noteIdx}-${marker.xPct}-${marker.yPct}`}
            style={{ left: `${marker.xPct}%`, top: `${marker.yPct}%` }}
            data-note-index={marker.noteIdx}
            title={translate(locale, "pdf.chordEditTitle", {
              chord: marker.chord,
            })}
            onClick={() => onEditChord(marker.noteIdx, marker.chord)}
          >
            {targetLabel(marker)}
          </button>
        ))}
        <span className="pdf-editor-hint">
          {translate(locale, "pdf.chordHint")}
        </span>
      </div>
    );
  }
  return (
    <div
      className="pdf-chord-layer"
      data-chords-visible={visible}
      aria-hidden={!visible}
      aria-label={translate(locale, "pdf.chordOverlay")}
      style={chordStyle}
    >
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
  stageRef,
  locale,
  onActive,
  chordMarkers,
  chordsVisible,
  editorEnabled = false,
  onEditChord,
  horizontal = false,
  onReady,
  onError,
  viewportRevision,
  zoomController,
}: {
  documentProxy: PDFDocumentProxy;
  pageNumber: number;
  zoomPercent: number;
  stageRef: RefObject<HTMLDivElement | null>;
  locale: Locale;
  onActive: (page: number) => void;
  chordMarkers?: PdfChordOverlayMarker[];
  chordsVisible: boolean;
  editorEnabled?: boolean;
  onEditChord?: (noteIdx: number, current: string) => void;
  horizontal?: boolean;
  viewportRevision: number;
  zoomController: RefObject<PdfZoomController | null>;
  onReady?: () => void;
  onError?: () => void;
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
      },
      {
        root: stageRef.current,
        rootMargin: `${Math.round((stageRef.current?.clientHeight ?? 720) / 2)}px ${Math.round((stageRef.current?.clientWidth ?? 720) / 2)}px`,
        threshold: 0.01,
      },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [pageNumber, stageRef, viewportRevision]);

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
        const stage = stageRef.current;
        const padding = stage && getComputedStyle(stage);
        const availableWidth = Math.max(
          1,
          (stage?.clientWidth ?? hostRef.current.clientWidth) -
            parseFloat(padding?.paddingLeft ?? "0") -
            parseFloat(padding?.paddingRight ?? "0"),
        );
        const fitScale = availableWidth / baseViewport.width;
        const scale = pdfPercentScale(zoomPercent, fitScale, fitScale);
        const logicalViewport = nextPage.getViewport({ scale });
        const dpr = pdfRasterScale(
          logicalViewport.width,
          logicalViewport.height,
          window.devicePixelRatio,
        );
        const viewport = nextPage.getViewport({
          scale: scale * dpr,
        });
        const canvas = canvasRef.current;
        // A detached render target prevents a cancelled task from writing into
        // the same visible canvas as the next zoom/resize render.
        const buffer = document.createElement("canvas");
        buffer.width = Math.floor(viewport.width);
        buffer.height = Math.floor(viewport.height);
        renderTask = nextPage.render({
          canvas: buffer,
          canvasContext: buffer.getContext("2d")!,
          viewport,
        });
        return renderTask.promise
          .then(() => {
            if (!disposed) {
              canvas.width = buffer.width;
              canvas.height = buffer.height;
              sizePdfCanvas(
                canvas,
                logicalViewport.width,
                logicalViewport.height,
                zoomPercent,
                zoomController.current?.percent,
              );
              canvas.getContext("2d")!.drawImage(buffer, 0, 0);
              canvas.dataset.pdfPageNumber = String(pageNumber);
              zoomController.current?.refresh();
              // Recheck the active page after a placeholder acquires its final
              // size, even when the viewport does not emit another scroll.
              stage?.dispatchEvent(new Event("pdfpageready"));
            }
          })
          .finally(() => {
            buffer.width = buffer.height = 0;
          });
      })
      .then(() => {
        if (!disposed) {
          setStatus("ready");
          onReady?.();
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setStatus("error");
          onError?.();
          recordDiagnostic("error", "pdf.page", error);
        }
      });
    return () => {
      disposed = true;
      renderTask?.cancel();
      cleanupPdfPage(pdfPage);
    };
  }, [
    documentProxy,
    zoomPercent,
    horizontal,
    viewportRevision,
    nearViewport,
    pageNumber,
    onReady,
    onError,
    stageRef,
    zoomController,
  ]);
  useEffect(() => {
    if (!nearViewport && canvasRef.current) {
      canvasRef.current.width = canvasRef.current.height = 0;
    }
  }, [nearViewport]);

  return (
    <div
      className={`${horizontal ? "pdf-horizontal-page" : "pdf-vertical-page"}${status === "ready" ? " is-ready" : ""}${zoomPercent === 100 ? " is-fit" : " is-zoomed"}`}
      data-pdf-page={pageNumber}
      ref={hostRef}
      tabIndex={0}
      aria-label={translate(locale, "pdf.pageAria", { page: pageNumber })}
      onFocus={() => onActive(pageNumber)}
    >
      <div
        className={`pdf-page-frame${zoomPercent === 100 ? " is-fit" : " is-zoomed"}`}
      >
        <canvas
          ref={canvasRef}
          aria-hidden={status !== "ready"}
          data-pdf-rendered={
            status === "ready" && nearViewport ? "true" : "false"
          }
        />
        {nearViewport && (
          <PdfDetailLayer
            documentProxy={documentProxy}
            pageNumber={pageNumber}
            stage={stageRef.current}
          />
        )}
        <PdfChordLayer
          markers={chordMarkers}
          visible={chordsVisible}
          locale={locale}
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
            ? translate(locale, "pdf.pageError")
            : translate(locale, "pdf.pageLoading", { page: pageNumber })}
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
  title,
  locale = "id",
  progressKey,
  onPageChange,
  chordOverlays,
  chordsVisible = false,
  variant = "default",
  editorEnabled = false,
  onEditChord,
  itemNavigation,
}: {
  src: string;
  data?: Uint8Array;
  initialPage?: number;
  pageRange?: { start: number; count: number };
  downloadUrl?: string;
  title?: string;
  locale?: Locale;
  progressKey?: string;
  onPageChange?: (page: number, totalPages: number) => void;
  chordOverlays?: Record<string, PdfChordOverlayMarker[]>;
  chordsVisible?: boolean;
  variant?: "default" | "hymn";
  itemNavigation?: {
    previous?: () => void;
    next?: () => void;
    previousLabel: string;
    nextLabel: string;
  };
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
  const [hasPainted, setHasPainted] = useState(false);
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
  const [renderZoomPercent, setRenderZoomPercent] = useState(100);
  const [viewportRevision, setViewportRevision] = useState(0);
  const [pageDraft, setPageDraft] = useState("");
  const toolsId = useId();
  useEffect(() => {
    const timer = window.setTimeout(
      () => setRenderZoomPercent(zoomPercent),
      100,
    );
    return () => window.clearTimeout(timer);
  }, [zoomPercent]);
  useEffect(() => {
    setPageDraft(String(page - pageStart + 1));
  }, [page, pageStart]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedRef = useRef<HTMLDivElement>(null);
  const advancedPresent = useMenuPresence(advancedOpen, advancedRef);
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const downloadPdf = async (event: ReactMouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    try {
      const currentPdf = data ?? (await documentProxy?.getData());
      const blob = currentPdf
        ? new Blob([Uint8Array.from(currentPdf).buffer], {
            type: "application/pdf",
          })
        : await fetch(downloadUrl ?? src).then((response) => {
            if (!response.ok) throw new Error("PDF download failed");
            return response.blob();
          });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${readerTitle}.pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setDownloadError(false);
    } catch {
      setDownloadError(true);
    }
  };
  const toggleFullscreen = () => {
    const target = pdfReaderRef.current;
    if (!target) return;
    const doc = target.ownerDocument as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => void;
    };
    const isActive =
      (doc.fullscreenElement ?? doc.webkitFullscreenElement) === target;
    if (isActive) {
      void (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
      setFullscreenActive(false);
    } else {
      const request =
        target.requestFullscreen?.() ??
        (
          target as HTMLElement & { webkitRequestFullscreen?: () => void }
        ).webkitRequestFullscreen?.();
      if (request && typeof request.catch === "function") {
        void request
          .then(() => setFullscreenActive(true))
          .catch(() => undefined);
      }
    }
  };
  useEffect(() => {
    const onFullscreenChange = () => {
      const target = pdfReaderRef.current;
      const doc = target?.ownerDocument as
        (Document & { webkitFullscreenElement?: Element | null }) | undefined;
      setFullscreenActive(
        Boolean(
          target &&
          (doc?.fullscreenElement ?? doc?.webkitFullscreenElement) === target,
        ),
      );
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        onFullscreenChange,
      );
    };
  }, []);
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
  const [loadErrorStatus, setLoadErrorStatus] = useState<number | undefined>();
  const [loadProgress, setLoadProgress] = useState(0);
  const [downloadPercent, setDownloadPercent] = useState<number>();
  const [loadPhase, setLoadPhase] = useState<
    "loading" | "slow" | "ready" | "error"
  >("loading");
  useReadinessMarker("gys-pdf-page-ready", status === "ready", page);
  const markPageReady = useCallback(() => {
    setLoadPhase("ready");
    setStatus("ready");
    setHasPainted(true);
  }, []);
  const markPageError = useCallback(() => {
    setLoadPhase("error");
    setStatus("error");
  }, []);
  const verticalStageRef = useRef<HTMLDivElement>(null);
  const pdfStageRef = useRef<HTMLDivElement>(null);
  const pdfReaderRef = useRef<HTMLElement>(null);
  const lastPaint = useRef<
    { document: PDFDocumentProxy; page: number } | undefined
  >(undefined);
  const zoomController = useRef<PdfZoomController | null>(null);
  const hydratingLayout = useRef(true);
  useEffect(() => {
    const stage = pdfStageRef.current;
    if (!stage) return;
    const controller = installPdfZoom(stage, setZoomPercent);
    zoomController.current = controller;
    return () => {
      controller.dispose();
      zoomController.current = null;
    };
  }, []);
  useEffect(() => {
    zoomController.current?.zoomTo(zoomPercent);
  }, [zoomPercent]);
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
  const effectiveLayout =
    total === 1 && layout === "two"
      ? "single"
      : pdfLayoutForViewport(layout, viewportWidth);
  const markActivePage = useCallback((nextPage: number) => {
    setPage((current) => (current === nextPage ? current : nextPage));
  }, []);
  useEffect(() => {
    const stage = pdfStageRef.current;
    if (
      !stage ||
      (effectiveLayout !== "vertical" && effectiveLayout !== "horizontal")
    )
      return;
    let frame: number | undefined;
    const onScroll = () => {
      if (frame !== undefined) return;
      frame = requestAnimationFrame(() => {
        frame = undefined;
        const bounds = stage.getBoundingClientRect();
        // One hit-test per frame also works when a zoomed page is much taller
        // than the viewport; intersection-ratio thresholds cannot track that.
        const active = document
          .elementFromPoint(
            bounds.left + bounds.width / 2,
            bounds.top + bounds.height / 2,
          )
          ?.closest<HTMLElement>("[data-pdf-page]");
        if (active && stage.contains(active))
          markActivePage(Number(active.dataset.pdfPage));
      });
    };
    stage.addEventListener("scroll", onScroll, { passive: true });
    stage.addEventListener("pdfpageready", onScroll);
    return () => {
      stage.removeEventListener("scroll", onScroll);
      stage.removeEventListener("pdfpageready", onScroll);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [effectiveLayout, markActivePage]);

  useEffect(() => {
    const stage = pdfStageRef.current;
    if (!stage) return;
    let timer: number | undefined;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(
        () => setViewportRevision((value) => value + 1),
        100,
      );
    });
    observer.observe(stage);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (status === "ready") restoreToolbar();
  }, [restoreToolbar, status]);

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

  // gyschordweb handleGlobalKeydown: viewer keyboard shortcuts.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      )
        return;
      if (!documentProxy) return;
      if (
        target &&
        target !== document.body &&
        !pdfReaderRef.current?.contains(target)
      )
        return;
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
      if (
        target &&
        target !== document.body &&
        !pdfReaderRef.current?.contains(target)
      )
        return;
      switch (event.key) {
        case "ArrowLeft":
        case "PageUp":
          event.preventDefault();
          goToPage(page - (effectiveLayout === "two" ? 2 : 1));
          break;
        case "ArrowRight":
        case "PageDown":
          event.preventDefault();
          goToPage(page + (effectiveLayout === "two" ? 2 : 1));
          break;
        case "Home":
          event.preventDefault();
          goToPage(pageStart);
          break;
        case "End":
          event.preventDefault();
          goToPage(pageStart + total - 1);
          break;
        case "ArrowUp":
          if (zoomPercent > 100) break;
          event.preventDefault();
          goToPage(page - (effectiveLayout === "two" ? 2 : 1));
          break;
        case "ArrowDown":
          if (zoomPercent > 100) break;
          event.preventDefault();
          goToPage(page + (effectiveLayout === "two" ? 2 : 1));
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [documentProxy, page, effectiveLayout, pageStart, total, zoomPercent]);

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
    documentRef.current = null;
    setDocumentProxy(null);
    setHasPainted(false);
    setTotal(0);
    setPageStart(Math.max(1, pageRange?.start ?? 1));
    setStatus("loading");
    setLoadErrorStatus(undefined);
    setLoadPhase("loading");
    setLoadProgress(8);
    setDownloadPercent(undefined);
    let slowTimer: number | undefined;
    let lastProgress = 8;
    const clearSlowTimer = () => {
      if (slowTimer !== undefined) window.clearTimeout(slowTimer);
      slowTimer = undefined;
    };
    const scheduleSlowNotice = () => {
      clearSlowTimer();
      slowTimer = window.setTimeout(() => {
        if (!disposed) setLoadPhase("slow");
      }, PDF_SLOW_LOAD_DELAY_MS);
    };
    const cleanup = () => {
      disposed = true;
      clearSlowTimer();
      documentRef.current = null;
      setDocumentProxy(null);
    };
    if (!src && !data) {
      setLoadPhase("error");
      setStatus("error");
      return cleanup;
    }
    scheduleSlowNotice();
    const lease = pdfDocuments.acquire(src, data, (progress) => {
      if (disposed) return;
      const pct =
        progress.total > 0
          ? Math.round((progress.loaded / progress.total) * 100)
          : 0;
      setDownloadPercent(progress.total > 0 ? Math.min(100, pct) : undefined);
      const nextProgress = Math.max(8, Math.min(96, pct));
      setLoadProgress((current) => Math.max(current, nextProgress));
      if (nextProgress > lastProgress) {
        lastProgress = nextProgress;
        setLoadPhase("loading");
        scheduleSlowNotice();
      }
    });
    void lease.promise
      .then((document) => {
        if (disposed) return;
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
        setLoadPhase("ready");
        clearSlowTimer();
      })
      .catch((error: unknown) => {
        if (!disposed) {
          clearSlowTimer();
          setLoadPhase("error");
          setStatus("error");
        }
        if (!disposed) setLoadErrorStatus(pdfHttpStatus(error));
        if (!disposed) recordDiagnostic("error", "pdf.document", error);
      });
    return () => {
      lease.release();
      cleanup();
    };
  }, [data, loadAttempt, pageRange?.count, pageRange?.start, src]);

  const onStageTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    restoreToolbar();
    if (event.touches.length === 2) {
      touchStartSingle.current = null;
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
  const onStageTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
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
        zoomPercent === 100 &&
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
    const buffers: HTMLCanvasElement[] = [];
    const pageNumbers =
      effectiveLayout === "single"
        ? [page]
        : [page, page + 1].filter((value) => value <= pageStart + total - 1);
    const canvases = [canvasRef.current, secondaryCanvasRef.current];
    const stageBox = pdfStageRef.current;
    const stageStyle = stageBox && getComputedStyle(stageBox);
    const stageWidth =
      (stageBox?.clientWidth ?? window.innerWidth) -
      parseFloat(stageStyle?.paddingLeft ?? "0") -
      parseFloat(stageStyle?.paddingRight ?? "0");
    const stageHeight =
      (stageBox?.clientHeight ?? window.innerHeight) -
      parseFloat(stageStyle?.paddingTop ?? "0") -
      parseFloat(stageStyle?.paddingBottom ?? "0");
    setStatus("loading");
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
        const fitScale = pdfFitScale(
          stageWidth,
          stageHeight,
          baseViewport.width,
          baseViewport.height,
          pageNumbers.length,
        );
        const scale = pdfPercentScale(renderZoomPercent, fitScale, fitScale);
        const logicalViewport = pdfPage.getViewport({ scale });
        const dpr = pdfRasterScale(
          logicalViewport.width,
          logicalViewport.height,
          window.devicePixelRatio,
        );
        const viewport = pdfPage.getViewport({
          scale: scale * dpr,
        });
        const buffer = document.createElement("canvas");
        buffers.push(buffer);
        buffer.width = viewport.width;
        buffer.height = viewport.height;
        const renderTask = pdfPage.render({
          canvas: buffer,
          canvasContext: buffer.getContext("2d")!,
          viewport,
        });
        renderTasks.push(renderTask);
        await renderTask.promise;
        return { canvas, buffer, logicalViewport, pageNumber };
      }),
    )
      .then(async (paintedPages) => {
        if (disposed) return;
        const commit = () => {
          if (disposed) return;
          for (const painted of paintedPages) {
            if (!painted) continue;
            const { canvas, buffer, logicalViewport, pageNumber } = painted;
            canvas.width = buffer.width;
            canvas.height = buffer.height;
            sizePdfCanvas(
              canvas,
              logicalViewport.width,
              logicalViewport.height,
              renderZoomPercent,
              zoomController.current?.percent,
            );
            canvas.getContext("2d")!.drawImage(buffer, 0, 0);
            canvas.dataset.pdfPageNumber = String(pageNumber);
          }
          zoomController.current?.refresh();
          lastPaint.current = { document: documentProxy, page };
          setLoadPhase("ready");
          setStatus("ready");
          setHasPainted(true);
        };
        // Commit a complete spread together. Only page changes take snapshots;
        // gesture zoom and resize keep their existing continuous animation.
        if (
          lastPaint.current?.document === documentProxy &&
          lastPaint.current.page !== page
        )
          await transitionReader(commit, "pdf");
        else commit();
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setLoadPhase("error");
          setStatus("error");
        }
        if (!disposed) recordDiagnostic("error", "pdf.page", error);
        // Stop late getPage results from allocating a second spread buffer
        // after another page failed and the batch has already been released.
        disposed = true;
      })
      .finally(async () => {
        for (const task of renderTasks) task.cancel();
        await Promise.allSettled(renderTasks.map((task) => task.promise));
        for (const buffer of buffers) buffer.width = buffer.height = 0;
      });
    return () => {
      disposed = true;
      for (const renderTask of renderTasks) renderTask.cancel();
      for (const pdfPage of pdfPages) cleanupPdfPage(pdfPage);
    };
  }, [
    documentProxy,
    effectiveLayout,
    page,
    pageStart,
    total,
    renderZoomPercent,
    viewportRevision,
  ]);

  useEffect(() => {
    if (!documentProxy || status !== "ready") return;
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    if (
      !viewerPrefs.preloadEnabled ||
      connection?.saveData ||
      /(^|-)2g$/.test(connection?.effectiveType ?? "")
    )
      return;
    const timer = window.setTimeout(() => {
      for (const next of [
        page - 1,
        page + (effectiveLayout === "two" ? 2 : 1),
      ]) {
        if (next >= pageStart && next < pageStart + total)
          void documentProxy.getPage(next).catch(() => undefined);
      }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [
    documentProxy,
    status,
    page,
    pageStart,
    total,
    effectiveLayout,
    viewerPrefs.preloadEnabled,
  ]);

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
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: effectiveLayout === "vertical" ? "start" : "nearest",
      inline: effectiveLayout === "horizontal" ? "center" : "nearest",
    });
  };
  useEffect(() => {
    if (
      !documentProxy ||
      (effectiveLayout !== "vertical" && effectiveLayout !== "horizontal")
    )
      return;
    const frame = requestAnimationFrame(() => {
      const target = verticalStageRef.current?.querySelector<HTMLElement>(
        `[data-pdf-page="${page}"]`,
      );
      target?.scrollIntoView({
        behavior: "instant",
        block: effectiveLayout === "vertical" ? "start" : "nearest",
        inline: effectiveLayout === "horizontal" ? "start" : "nearest",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [documentProxy, effectiveLayout]);
  const canResume =
    total > 0 &&
    resumePage !== undefined &&
    resumePage !== page &&
    resumePage >= pageStart &&
    resumePage <= pageStart + total - 1;
  const retry = () => {
    pdfDocuments.invalidate(src, data);
    setStatus("loading");
    setLoadErrorStatus(undefined);
    setLoadPhase("loading");
    setLoadProgress(8);
    setLoadAttempt((attempt) => attempt + 1);
  };
  useEffect(() => {
    if (!pdfReaderRef.current) return;
    return enhancePdfReader(pdfReaderRef.current);
  }, [variant, locale]);
  useEffect(() => {
    if (!advancedOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !pdfReaderRef.current
          ?.querySelector(".pdf-toolbar")
          ?.contains(event.target)
      ) {
        setAdvancedOpen(false);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [advancedOpen]);
  const readerTitle = title ?? translate(locale, "pdf.readerTitle");
  const navigateItems = Boolean(itemNavigation && total === 1);
  const showItemNavigation = Boolean(itemNavigation && total > 1);

  return (
    <section
      ref={pdfReaderRef}
      className={`pdf-reader${variant === "hymn" ? " pdf-reader-hymn" : ""}`}
      aria-label={readerTitle}
      data-pdf-locale={locale}
      data-pdf-loading-phase={loadPhase}
      data-pdf-loading-progress={loadProgress}
      onPointerMove={restoreToolbar}
    >
      <div
        className={`pdf-toolbar${showItemNavigation ? " has-item-navigation" : ""}${variant === "hymn" && !toolbarVisible ? " is-collapsed" : ""}`}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !advancedOpen) return;
          event.stopPropagation();
          event.preventDefault();
          setAdvancedOpen(false);
          pdfReaderRef.current
            ?.querySelector<HTMLButtonElement>(".pdf-advanced-toggle")
            ?.focus();
        }}
      >
        {showItemNavigation && (
          <button
            className="pdf-song-navigation"
            type="button"
            onClick={itemNavigation?.previous}
            disabled={!itemNavigation?.previous}
            aria-label={itemNavigation?.previousLabel}
            title={itemNavigation?.previousLabel}
          >
            <Icon name="skipPrevious" size={18} />
          </button>
        )}
        <div className="pdf-page-navigation">
          <button
            type="button"
            aria-label={
              navigateItems
                ? itemNavigation?.previousLabel
                : translate(locale, "pdf.previous")
            }
            title={
              navigateItems
                ? itemNavigation?.previousLabel
                : translate(locale, "pdf.previous")
            }
            onClick={() =>
              navigateItems
                ? itemNavigation?.previous?.()
                : goToPage(page + (effectiveLayout === "two" ? -2 : -1))
            }
            disabled={
              navigateItems ? !itemNavigation?.previous : page <= pageStart
            }
          >
            <Icon
              name={navigateItems ? "skipPrevious" : "chevronLeft"}
              size={18}
            />
          </button>
          <span className={total > 1 ? "sr-only" : undefined}>
            {total
              ? translate(locale, "pdf.pageCounter", {
                  page: pageStart > 1 ? page - pageStart + 1 : page,
                  total,
                })
              : translate(locale, "pdf.pageCurrent", {
                  page: pageStart > 1 ? page - pageStart + 1 : page,
                })}
          </span>
          {total > 1 && (
            <label className="pdf-page-jump">
              <span className="sr-only">
                {translate(locale, "pdf.jumpLabel")}
              </span>
              <input
                type="number"
                min={1}
                max={total}
                value={pageDraft}
                aria-label={translate(locale, "pdf.jumpAria")}
                onChange={(event) => setPageDraft(event.target.value)}
                onBlur={(event) => {
                  const next = Number(event.currentTarget.value) || 1;
                  goToPage(pageStart + next - 1);
                  setPageDraft(String(Math.max(1, Math.min(total, next))));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    event.preventDefault();
                    event.currentTarget.value = String(page - pageStart + 1);
                    setPageDraft(event.currentTarget.value);
                    event.currentTarget.blur();
                  }
                }}
              />
              <span className="pdf-page-total">/ {total}</span>
            </label>
          )}
          <button
            type="button"
            aria-label={
              navigateItems
                ? itemNavigation?.nextLabel
                : translate(locale, "pdf.next")
            }
            title={
              navigateItems
                ? itemNavigation?.nextLabel
                : translate(locale, "pdf.next")
            }
            onClick={() =>
              navigateItems
                ? itemNavigation?.next?.()
                : goToPage(page + (effectiveLayout === "two" ? 2 : 1))
            }
            disabled={
              navigateItems
                ? !itemNavigation?.next
                : total === 0 || page >= pageStart + total - 1
            }
          >
            <Icon
              name={navigateItems ? "skipNext" : "chevronRight"}
              size={18}
            />
          </button>
          {canResume && (
            <button
              className="pdf-resume"
              type="button"
              data-pdf-resume="true"
              onClick={() => goToPage(resumePage)}
            >
              {translate(locale, "pdf.resume", { page: resumePage })}
            </button>
          )}
        </div>
        {showItemNavigation && (
          <button
            className="pdf-song-navigation"
            type="button"
            onClick={itemNavigation?.next}
            disabled={!itemNavigation?.next}
            aria-label={itemNavigation?.nextLabel}
            title={itemNavigation?.nextLabel}
          >
            <Icon name="skipNext" size={18} />
          </button>
        )}
        {
          <button
            className="pdf-advanced-toggle"
            type="button"
            aria-expanded={advancedOpen}
            aria-controls={toolsId}
            aria-label={translate(
              locale,
              advancedOpen ? "pdf.settingsClose" : "pdf.settings",
            )}
            title={translate(
              locale,
              advancedOpen ? "pdf.settingsClose" : "pdf.settings",
            )}
            onClick={() => setAdvancedOpen((value) => !value)}
          >
            <Icon name="settings" size={16} />
            <span className="sr-only">
              {translate(
                locale,
                advancedOpen ? "pdf.settingsClose" : "pdf.settings",
              )}
            </span>
          </button>
        }
        <div
          ref={advancedRef}
          id={toolsId}
          className={`pdf-advanced-controls${advancedPresent ? " is-open" : ""}`}
          data-menu-open={advancedOpen}
          aria-hidden={!advancedOpen}
          inert={!advancedOpen}
        >
          <div
            className="pdf-zoom-controls"
            role="group"
            aria-label={translate(locale, "pdf.zoomGroup")}
          >
            <button
              type="button"
              onClick={() =>
                setZoomPercent((value) => clampPdfZoomPercent(value - 25))
              }
              disabled={zoomPercent <= 100}
              aria-label={translate(locale, "pdf.zoomOut")}
              title={translate(locale, "pdf.zoomOut")}
            >
              −
            </button>
            <button
              type="button"
              className="pdf-zoom-indicator"
              data-pdf-zoom-indicator="true"
              aria-label={translate(locale, "pdf.zoomReset")}
              title={translate(locale, "pdf.zoomResetTitle")}
              onClick={() => setZoomPercent(100)}
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
              aria-label={translate(locale, "pdf.zoomIn")}
              title={translate(locale, "pdf.zoomIn")}
            >
              +
            </button>
            <button
              type="button"
              className="pdf-zoom-reset"
              onClick={() => setZoomPercent(100)}
              disabled={zoomPercent === 100}
              aria-label={translate(locale, "pdf.zoomReset")}
              title={translate(locale, "pdf.zoomReset")}
            >
              {translate(locale, "pdf.zoomReset")}
            </button>
          </div>
          <label>
            {translate(locale, "pdf.zoomLabel")}{" "}
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
            aria-label={translate(locale, "pdf.layoutGroup")}
          >
            {(["single", "two", "vertical", "horizontal"] as const).map(
              (value) => (
                <button
                  key={value}
                  type="button"
                  className={layout === value ? "is-active" : ""}
                  onClick={() => setLayout(value)}
                  aria-pressed={layout === value}
                  aria-label={translate(
                    locale,
                    value === "single"
                      ? "pdf.layout.single"
                      : value === "two"
                        ? "pdf.layout.two"
                        : value === "vertical"
                          ? "pdf.layout.vertical"
                          : "pdf.layout.horizontal",
                  )}
                  title={translate(
                    locale,
                    value === "single"
                      ? "pdf.layout.single"
                      : value === "two"
                        ? "pdf.layout.two"
                        : value === "vertical"
                          ? "pdf.layout.verticalTitle"
                          : "pdf.layout.horizontalTitle",
                  )}
                >
                  <Icon
                    name={
                      value === "single"
                        ? "file"
                        : value === "two"
                          ? "columns"
                          : value === "vertical"
                            ? "swapVert"
                            : "book"
                    }
                    size={15}
                  />
                  <span className="sr-only">
                    {translate(
                      locale,
                      value === "single"
                        ? "pdf.layout.single"
                        : value === "two"
                          ? "pdf.layout.two"
                          : value === "vertical"
                            ? "pdf.layout.vertical"
                            : "pdf.layout.horizontal",
                    )}
                  </span>
                </button>
              ),
            )}
          </div>
          {
            <button
              className="pdf-fullscreen-toggle"
              type="button"
              onClick={toggleFullscreen}
              aria-label={translate(
                locale,
                fullscreenActive ? "pdf.exitFullscreen" : "pdf.fullscreen",
              )}
              title={translate(
                locale,
                fullscreenActive ? "pdf.exitFullscreen" : "pdf.fullscreen",
              )}
            >
              <Icon name="fullscreen" size={18} />
            </button>
          }
          {layout === "two" && effectiveLayout === "single" && (
            <small className="pdf-layout-note">
              {translate(locale, "pdf.layoutNarrowNote")}
            </small>
          )}
          {(downloadUrl || src) && (
            <a
              className="pdf-download"
              href={downloadUrl ?? src}
              download={`${readerTitle}.pdf`}
              onClick={downloadPdf}
              aria-label={translate(locale, "pdf.download")}
              title={translate(locale, "pdf.download")}
            >
              <Icon name="download" size={16} />
              <span className="sr-only">
                {translate(locale, "pdf.download")}
              </span>
            </a>
          )}
          {downloadError && (
            <span role="status">{translate(locale, "pdf.downloadError")}</span>
          )}
        </div>
      </div>
      <div
        className={`pdf-stage${zoomPercent === 100 ? " is-fit" : " is-zoomed"}`}
        data-pdf-layout={effectiveLayout}
        ref={pdfStageRef}
        onTouchStart={onStageTouchStart}
        onTouchEnd={onStageTouchEnd}
        onClick={restoreToolbar}
      >
        {status === "loading" && (
          <div
            className={`pdf-loading${hasPainted ? " is-page-loading" : ""}${loadPhase === "slow" ? " is-slow" : ""}`}
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
            <div className="pdf-loading-page">
              <LoadingProgress
                label={
                  downloadPercent === undefined
                    ? translate(locale, "pdf.loadingDocument")
                    : translate(locale, "pdf.loading", {
                        percent: downloadPercent,
                      })
                }
                percent={downloadPercent}
              />
              {loadPhase === "slow" && (
                <div className="pdf-loading-slow">
                  <p>{translate(locale, "pdf.loadingSlow")}</p>
                  <div className="pdf-loading-actions">
                    <button
                      className="quiet-button"
                      type="button"
                      data-pdf-retry="true"
                      onClick={retry}
                    >
                      {translate(locale, "pdf.retry")}
                    </button>
                    {downloadUrl && (
                      <a
                        className="quiet-button pdf-loading-source"
                        href={downloadUrl}
                        download={`${readerTitle}.pdf`}
                        aria-label={translate(locale, "pdf.download")}
                        title={translate(locale, "pdf.download")}
                      >
                        <Icon name="download" size={15} />
                        <span>{translate(locale, "pdf.download")}</span>
                      </a>
                    )}
                  </div>
                </div>
              )}
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
              {translate(locale, "pdf.orientation")}
            </div>
          )}
        {status === "error" && (
          <div
            className="pdf-error-state"
            role="alert"
            data-pdf-error-status={loadErrorStatus ?? "unknown"}
          >
            <p>
              {translate(
                locale,
                loadErrorStatus === 404 ? "pdf.error404" : "pdf.error",
              )}
            </p>
            <button
              className="quiet-button"
              type="button"
              data-pdf-retry="true"
              onClick={retry}
            >
              {translate(locale, "pdf.retry")}
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
                  zoomPercent={renderZoomPercent}
                  zoomController={zoomController}
                  stageRef={pdfStageRef}
                  viewportRevision={viewportRevision}
                  locale={locale}
                  onActive={markActivePage}
                  {...(chordOverlays?.[String(pageNumber)]
                    ? { chordMarkers: chordOverlays[String(pageNumber)] }
                    : {})}
                  chordsVisible={chordsVisible}
                  editorEnabled={editorEnabled}
                  onEditChord={(noteIdx, current) =>
                    onEditChord?.(String(pageNumber), noteIdx, current)
                  }
                  horizontal={effectiveLayout === "horizontal"}
                  onReady={markPageReady}
                  onError={markPageError}
                />
              );
            })}
          </div>
        ) : (
          <div className={`pdf-pages pdf-layout-${effectiveLayout}`}>
            <div
              className={`pdf-page-frame${zoomPercent === 100 ? " is-fit" : " is-zoomed"}`}
            >
              <canvas
                className={zoomPercent === 100 ? "is-fit" : ""}
                ref={canvasRef}
                aria-label={translate(locale, "pdf.pageAria", { page })}
                aria-hidden={!hasPainted || status === "error"}
                data-pdf-rendered={status === "ready" ? "true" : "false"}
              />
              {documentProxy && (
                <PdfDetailLayer
                  documentProxy={documentProxy}
                  pageNumber={page}
                  stage={pdfStageRef.current}
                />
              )}
              <PdfChordLayer
                markers={chordOverlays?.[String(page)]}
                visible={chordsVisible}
                locale={locale}
                editorEnabled={editorEnabled}
                onEditChord={(noteIdx, current) =>
                  onEditChord?.(String(page), noteIdx, current)
                }
              />
            </div>
            <div
              className={`pdf-page-frame${zoomPercent === 100 ? " is-fit" : " is-zoomed"}`}
            >
              <canvas
                className={zoomPercent === 100 ? "is-fit" : ""}
                ref={secondaryCanvasRef}
                aria-label={translate(locale, "pdf.pageAria", {
                  page: page + 1,
                })}
                aria-hidden={
                  !hasPainted ||
                  status === "error" ||
                  effectiveLayout !== "two" ||
                  page + 1 >= pageStart + total
                }
                data-pdf-rendered={
                  status === "ready" &&
                  effectiveLayout === "two" &&
                  page + 1 < pageStart + total
                    ? "true"
                    : "false"
                }
              />
              {documentProxy && page + 1 < pageStart + total && (
                <PdfDetailLayer
                  documentProxy={documentProxy}
                  pageNumber={page + 1}
                  stage={pdfStageRef.current}
                />
              )}
              <PdfChordLayer
                markers={chordOverlays?.[String(page + 1)]}
                visible={chordsVisible}
                locale={locale}
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
