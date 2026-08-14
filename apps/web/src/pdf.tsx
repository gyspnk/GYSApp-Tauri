import { useEffect, useRef, useState } from "react";
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

export function PdfReader({
  src,
  data,
  initialPage = 1,
  downloadUrl,
  title = "PDF reader",
}: {
  src: string;
  data?: Uint8Array;
  initialPage?: number;
  downloadUrl?: string;
  title?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const secondaryCanvasRef = useRef<HTMLCanvasElement>(null);
  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy | null>(
    null,
  );
  const [page, setPage] = useState(initialPage);
  const [total, setTotal] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(false);
  const [layout, setLayout] = useState<"single" | "two" | "vertical">("single");
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

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

  useEffect(() => {
    if (!documentProxy || !canvasRef.current) return;
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

  return (
    <section className="pdf-reader" aria-label={title}>
      <div className="pdf-toolbar">
        <button
          type="button"
          onClick={() =>
            setPage((value) =>
              nextPdfPage(value, total, layout === "two" ? -2 : -1),
            )
          }
          disabled={page <= 1}
        >
          Previous
        </button>
        <span>
          Page {page}
          {total ? ` / ${total}` : ""}
        </span>
        <button
          type="button"
          onClick={() =>
            setPage((value) =>
              nextPdfPage(value, total, layout === "two" ? 2 : 1),
            )
          }
          disabled={total === 0 || page >= total}
        >
          Next
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
      <div className="pdf-stage">
        {status === "loading" && <p>Loading local PDF…</p>}
        {status === "error" && (
          <p>PDF is unavailable offline. Pin it and try again.</p>
        )}
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
      </div>
    </section>
  );
}
