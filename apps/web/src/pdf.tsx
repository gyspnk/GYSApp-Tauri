import {
  useEffect,
  useRef,
  useState,
  type TouchEvent,
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
  clampPdfZoom,
  cleanupPdfPage,
  disposePdfDocument,
  isPdfLayout,
  pdfDocumentSourceOptions,
  pdfPageWindow,
  pdfLayoutForViewport,
  shouldRenderPdfPage,
  type PdfLayout,
} from "./pdf-utils.js";
import { recordDiagnostic } from "./diagnostics.js";
import { hapticTick } from "./haptics.js";
import { useReadingToolbarAutoHide } from "./use-toolbar-auto-hide.js";

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
}: {
  markers: PdfChordOverlayMarker[] | undefined;
  visible: boolean;
}) {
  if (!visible || !markers?.length) return null;
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

function readPdfLayout(progressKey: string | undefined): PdfLayout {
  if (!progressKey || typeof window === "undefined") return "single";
  try {
    const stored = window.localStorage.getItem(`gys-pdf-layout:${progressKey}`);
    return isPdfLayout(stored) ? stored : "single";
  } catch {
    return "single";
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
  zoom,
  fit,
  stageRef,
  onActive,
  chordMarkers,
  chordsVisible,
  horizontal = false,
}: {
  documentProxy: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  fit: boolean;
  stageRef: RefObject<HTMLDivElement | null>;
  onActive: (page: number) => void;
  chordMarkers?: PdfChordOverlayMarker[];
  chordsVisible: boolean;
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
        const scale = fit ? Math.min(zoom, fitScale) : zoom;
        const viewport = nextPage.getViewport({
          scale: Math.max(0.35, scale),
        });
        const canvas = canvasRef.current;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
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
  }, [documentProxy, fit, horizontal, nearViewport, pageNumber, zoom]);

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
        <PdfChordLayer markers={chordMarkers} visible={chordsVisible} />
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
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  const [layout, setLayout] = useState<PdfLayout>(() =>
    readPdfLayout(progressKey),
  );
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1024 : window.innerWidth,
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const verticalStageRef = useRef<HTMLDivElement>(null);
  const hydratingLayout = useRef(true);
  const pinchStart = useRef<{ distance: number; zoom: number } | undefined>(
    undefined,
  );
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(
    null,
  );
  const touchStartSingle = useRef<{
    x: number;
    y: number;
    time: number;
  } | null>(null);
  const { toolbarVisible, restoreToolbar } = useReadingToolbarAutoHide();
  const effectiveLayout = pdfLayoutForViewport(layout, viewportWidth);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    hydratingLayout.current = true;
    setLayout(readPdfLayout(progressKey));
  }, [progressKey]);

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
        zoom,
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
    setZoom(
      clampPdfZoom(
        pinchStart.current.zoom * (distance / pinchStart.current.distance),
      ),
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
          if (zoom > 1.1 || !fit) {
            setZoom(1);
            setFit(true);
          } else {
            setZoom(1.8);
            setFit(false);
          }
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
        const availableWidth = Math.max(
          320,
          (canvas.parentElement?.clientWidth ?? window.innerWidth) - 32,
        );
        const fitScale = availableWidth / baseViewport.width;
        const viewport = pdfPage.getViewport({
          scale: fit ? Math.min(zoom, fitScale) : zoom,
        });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
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
  }, [documentProxy, effectiveLayout, fit, page, pageStart, total, zoom]);

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
    <section className="pdf-reader" aria-label={title}>
      <div className={`pdf-toolbar${toolbarVisible ? "" : " is-collapsed"}`}>
        <button
          type="button"
          onClick={() => goToPage(page + (effectiveLayout === "two" ? -2 : -1))}
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
        {total > 0 && (
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
        <label>
          Zoom{" "}
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.1"
            value={zoom}
            onChange={(event) =>
              setZoom(clampPdfZoom(Number(event.target.value)))
            }
          />
        </label>
        <button type="button" onClick={() => setFit((value) => !value)}>
          {fit ? "Ukuran asli" : "Sesuaikan"}
        </button>
        <div className="pdf-layout-toggle" role="group" aria-label="Layout PDF">
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
      <div
        className="pdf-stage"
        data-pdf-layout={effectiveLayout}
        onTouchStart={onStageTouchStart}
        onTouchMove={onStageTouchMove}
        onTouchEnd={onStageTouchEnd}
        onClick={restoreToolbar}
      >
        {status === "loading" && <p>Memuat PDF lokal…</p>}
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
                  zoom={zoom}
                  fit={fit}
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
                  horizontal={effectiveLayout === "horizontal"}
                />
              );
            })}
          </div>
        ) : (
          <div className={`pdf-pages pdf-layout-${effectiveLayout}`}>
            <div className="pdf-page-frame">
              <canvas
                className={fit ? "is-fit" : ""}
                ref={canvasRef}
                aria-label={`PDF page ${page}`}
              />
              <PdfChordLayer
                markers={chordOverlays?.[String(page)]}
                visible={chordsVisible}
              />
            </div>
            <div className="pdf-page-frame">
              <canvas
                className={fit ? "is-fit" : ""}
                ref={secondaryCanvasRef}
                aria-label={`PDF page ${page + 1}`}
              />
              <PdfChordLayer
                markers={chordOverlays?.[String(page + 1)]}
                visible={chordsVisible}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
