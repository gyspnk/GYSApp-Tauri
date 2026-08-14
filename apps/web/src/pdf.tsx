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
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { clampPdfZoom, nextPdfPage } from "./pdf-utils.js";

GlobalWorkerOptions.workerSrc = workerSrc;

export { clampPdfZoom, nextPdfPage } from "./pdf-utils.js";

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
}: {
  documentProxy: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  fit: boolean;
  stageRef: RefObject<HTMLDivElement | null>;
  onActive: (page: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nearViewport, setNearViewport] = useState(pageNumber <= 2);
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
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true);
          onActive(pageNumber);
        }
      },
      { root: stageRef.current, rootMargin: "720px 0px", threshold: 0.01 },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [onActive, pageNumber, stageRef]);

  useEffect(() => {
    if (!nearViewport || !canvasRef.current || !hostRef.current) return;
    let disposed = false;
    let renderTask: ReturnType<PDFPageProxy["render"]> | undefined;
    setStatus("loading");
    void documentProxy
      .getPage(pageNumber)
      .then((pdfPage) => {
        if (disposed || !canvasRef.current || !hostRef.current) return;
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const availableWidth = Math.max(320, hostRef.current.clientWidth - 32);
        const fitScale = availableWidth / baseViewport.width;
        const scale = fit ? Math.min(zoom, fitScale) : zoom;
        const viewport = pdfPage.getViewport({ scale: Math.max(0.35, scale) });
        const canvas = canvasRef.current;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        renderTask = pdfPage.render({
          canvas,
          canvasContext: canvas.getContext("2d")!,
          viewport,
        });
        return renderTask.promise;
      })
      .then(() => {
        if (!disposed) setStatus("ready");
      })
      .catch(() => {
        if (!disposed) setStatus("error");
      });
    return () => {
      disposed = true;
      renderTask?.cancel();
      if (canvasRef.current) {
        canvasRef.current.width = 0;
        canvasRef.current.height = 0;
      }
    };
  }, [documentProxy, fit, nearViewport, pageNumber, zoom]);

  return (
    <div
      className={`pdf-vertical-page${status === "ready" ? " is-ready" : ""}`}
      data-pdf-page={pageNumber}
      ref={hostRef}
      tabIndex={0}
      aria-label={`PDF page ${pageNumber}`}
      onFocus={() => onActive(pageNumber)}
    >
      <canvas ref={canvasRef} aria-hidden={status !== "ready"} />
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
  downloadUrl,
  title = "PDF reader",
  progressKey,
  onPageChange,
}: {
  src: string;
  data?: Uint8Array;
  initialPage?: number;
  downloadUrl?: string;
  title?: string;
  progressKey?: string;
  onPageChange?: (page: number, totalPages: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const secondaryCanvasRef = useRef<HTMLCanvasElement>(null);
  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy | null>(
    null,
  );
  const [page, setPage] = useState(() => {
    if (!progressKey || typeof window === "undefined") return initialPage;
    const stored = Number(
      window.localStorage.getItem(`gys-pdf-page:${progressKey}`),
    );
    return Number.isInteger(stored) && stored > 0 ? stored : initialPage;
  });
  const [total, setTotal] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(false);
  const [layout, setLayout] = useState<"single" | "two" | "vertical">("single");
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const verticalStageRef = useRef<HTMLDivElement>(null);
  const pinchStart = useRef<{ distance: number; zoom: number } | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!progressKey) return;
    const stored = Number(
      window.localStorage.getItem(`gys-pdf-page:${progressKey}`),
    );
    setPage(Number.isInteger(stored) && stored > 0 ? stored : initialPage);
  }, [initialPage, progressKey]);

  useEffect(() => {
    if (!progressKey || !total) return;
    window.localStorage.setItem(`gys-pdf-page:${progressKey}`, String(page));
  }, [page, progressKey, total]);

  useEffect(() => {
    if (total > 0) onPageChange?.(page, total);
  }, [onPageChange, page, total]);

  useEffect(() => {
    let disposed = false;
    setDocumentProxy(null);
    setTotal(0);
    setStatus("loading");
    if (!src && !data) {
      setStatus("error");
      return () => undefined;
    }
    const loadingTask = getDocument(
      data ? { data: data.slice() } : { url: src },
    );
    void loadingTask.promise
      .then((document) => {
        if (disposed) return;
        setTotal(document.numPages);
        setPage((current) => Math.max(1, Math.min(document.numPages, current)));
        setDocumentProxy(document);
      })
      .catch(() => {
        if (!disposed) setStatus("error");
      });
    return () => {
      disposed = true;
      void loadingTask.destroy();
      setDocumentProxy(null);
    };
  }, [data, src]);

  const onStageTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) return;
    const [first, second] = [event.touches[0], event.touches[1]];
    if (!first || !second) return;
    pinchStart.current = {
      distance: Math.hypot(
        second.clientX - first.clientX,
        second.clientY - first.clientY,
      ),
      zoom,
    };
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
  const onStageTouchEnd = () => {
    pinchStart.current = undefined;
  };

  useEffect(() => {
    if (!documentProxy || !canvasRef.current) return;
    if (layout === "vertical") return;
    let disposed = false;
    const renderTasks: Array<ReturnType<PDFPageProxy["render"]>> = [];
    const pageNumbers =
      layout === "single"
        ? [page]
        : [page, page + 1].filter((value) => value <= documentProxy.numPages);
    const canvases = [canvasRef.current, secondaryCanvasRef.current];
    void Promise.all(
      pageNumbers.map(async (pageNumber, index) => {
        const canvas = canvases[index];
        if (!canvas) return;
        const pdfPage = await documentProxy.getPage(
          Math.max(1, Math.min(documentProxy.numPages, pageNumber)),
        );
        if (disposed) return;
        const viewport = pdfPage.getViewport({ scale: zoom });
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
      .catch(() => {
        if (!disposed) setStatus("error");
      });
    return () => {
      disposed = true;
      for (const renderTask of renderTasks) renderTask.cancel();
      if (secondaryCanvasRef.current) secondaryCanvasRef.current.width = 0;
    };
  }, [documentProxy, layout, page, zoom]);

  const goToPage = (next: number) => {
    const bounded = nextPdfPage(next, total, 0);
    setPage(bounded);
    if (layout !== "vertical") return;
    const target = verticalStageRef.current?.querySelector<HTMLElement>(
      `[data-pdf-page="${bounded}"]`,
    );
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="pdf-reader" aria-label={title}>
      <div className="pdf-toolbar">
        <button
          type="button"
          onClick={() => goToPage(page + (layout === "two" ? -2 : -1))}
          disabled={page <= 1}
        >
          Sebelumnya
        </button>
        <span>
          Page {page}
          {total ? ` / ${total}` : ""}
        </span>
        <button
          type="button"
          onClick={() => goToPage(page + (layout === "two" ? 2 : 1))}
          disabled={total === 0 || page >= total}
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
          {(["single", "two", "vertical"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={layout === value ? "is-active" : ""}
              onClick={() => setLayout(value)}
            >
              {value === "single"
                ? "1 halaman"
                : value === "two"
                  ? "2 halaman"
                  : "Vertikal"}
            </button>
          ))}
        </div>
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
        onTouchStart={onStageTouchStart}
        onTouchMove={onStageTouchMove}
        onTouchEnd={onStageTouchEnd}
      >
        {status === "loading" && <p>Memuat PDF lokal…</p>}
        {status === "error" && (
          <p>
            PDF belum tersedia offline. Simpan dulu saat tersambung internet.
          </p>
        )}
        {layout === "vertical" ? (
          <div className="pdf-pages pdf-layout-vertical" ref={verticalStageRef}>
            {Array.from({ length: total }, (_, index) => (
              <VerticalPdfPage
                key={index + 1}
                documentProxy={documentProxy!}
                pageNumber={index + 1}
                zoom={zoom}
                fit={fit}
                stageRef={verticalStageRef}
                onActive={(nextPage) => {
                  setPage((current) =>
                    current === nextPage ? current : nextPage,
                  );
                }}
              />
            ))}
          </div>
        ) : (
          <div className={`pdf-pages pdf-layout-${layout}`}>
            <canvas
              className={fit ? "is-fit" : ""}
              ref={canvasRef}
              aria-label={`PDF page ${page}`}
            />
            <canvas
              className={fit ? "is-fit" : ""}
              ref={secondaryCanvasRef}
              aria-label={`PDF page ${page + 1}`}
            />
          </div>
        )}
      </div>
    </section>
  );
}
