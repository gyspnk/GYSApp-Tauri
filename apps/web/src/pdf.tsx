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
  initialPage = 1,
}: {
  src: string;
  initialPage?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy | null>(
    null,
  );
  const [page, setPage] = useState(initialPage);
  const [total, setTotal] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    let disposed = false;
    setDocumentProxy(null);
    setTotal(0);
    setStatus("loading");
    const loadingTask = getDocument({ url: src });
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
  }, [src]);

  useEffect(() => {
    if (!documentProxy || !canvasRef.current) return;
    let disposed = false;
    let renderTask: ReturnType<PDFPageProxy["render"]> | undefined;
    void documentProxy
      .getPage(Math.max(1, Math.min(documentProxy.numPages, page)))
      .then(async (pdfPage) => {
        if (disposed || !canvasRef.current) return;
        const viewport = pdfPage.getViewport({ scale: zoom });
        const canvas = canvasRef.current;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        renderTask = pdfPage.render({
          canvas,
          canvasContext: canvas.getContext("2d")!,
          viewport,
        });
        await renderTask.promise;
        if (!disposed) setStatus("ready");
      })
      .catch(() => {
        if (!disposed) setStatus("error");
      });
    return () => {
      disposed = true;
      renderTask?.cancel();
    };
  }, [documentProxy, page, zoom]);

  return (
    <section className="pdf-reader" aria-label="PDF reader">
      <div className="pdf-toolbar">
        <button
          type="button"
          onClick={() => setPage((value) => nextPdfPage(value, total, -1))}
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
          onClick={() => setPage((value) => nextPdfPage(value, total, 1))}
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
      </div>
      <div className="pdf-stage">
        {status === "loading" && <p>Loading local PDF…</p>}
        {status === "error" && (
          <p>PDF is unavailable offline. Pin it and try again.</p>
        )}
        <canvas ref={canvasRef} aria-label={`PDF page ${page}`} />
      </div>
    </section>
  );
}
