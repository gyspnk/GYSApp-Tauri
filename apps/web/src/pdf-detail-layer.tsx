import { useEffect, useRef } from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { cleanupPdfPage } from "./pdf-utils.js";
import { recordDiagnostic } from "./diagnostics.js";

const TILE_SIZE = 512;

/** Rasterize only the visible part at screen density. Whole-page previews
 * stay bounded at high zoom; these small tiles retain vector text sharpness. */
export function PdfDetailLayer({
  documentProxy,
  pageNumber,
  stage,
}: {
  documentProxy: PDFDocumentProxy;
  pageNumber: number;
  stage: HTMLElement | null;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const layer = layerRef.current;
    const host = layer?.parentElement;
    const canvas = host?.querySelector<HTMLCanvasElement>(":scope > canvas");
    if (!layer || !host || !canvas || !stage) return;
    let disposed = false,
      revision = 0,
      timer = 0;
    /** Sharp tiles exist only while the page is shown larger than its raster.
     * Comparing displayed CSS pixels with the raster's CSS size answers that
     * immediately from the style, without waiting for a re-render. */
    const needsDetail = () => {
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const rasterWidth = canvas.width / dpr;
      return (
        Number(canvas.dataset.pdfWidth) > 0 &&
        canvas.getBoundingClientRect().width > rasterWidth * 1.01
      );
    };
    let tasks: Array<ReturnType<PDFPageProxy["render"]>> = [];
    let detailPage: PDFPageProxy | undefined;
    const release = (canvases: HTMLCanvasElement[]) => {
      for (const tile of canvases) tile.width = tile.height = 0;
    };
    const clear = () => {
      release(Array.from(layer.querySelectorAll("canvas")));
      layer.replaceChildren();
    };
    const cancel = () => {
      revision++;
      for (const task of tasks) task.cancel();
      tasks = [];
    };
    const render = async () => {
      cancel();
      const current = revision;
      const width = Number(canvas.dataset.pdfWidth);
      const height = Number(canvas.dataset.pdfHeight);
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      if (
        !width ||
        !height ||
        canvas.dataset.pdfPageNumber !== String(pageNumber)
      ) {
        clear();
        return;
      }
      if (canvas.width / width >= dpr - 0.01) {
        clear();
        return;
      }
      const frame = host.getBoundingClientRect(),
        bounds = stage.getBoundingClientRect();
      const ratio = frame.width / width;
      const left = Math.max(0, (bounds.left - frame.left) / ratio);
      const top = Math.max(0, (bounds.top - frame.top) / ratio);
      const right = Math.min(width, (bounds.right - frame.left) / ratio);
      const bottom = Math.min(height, (bounds.bottom - frame.top) / ratio);
      if (right <= left || bottom <= top) {
        clear();
        return;
      }
      const tiles: HTMLCanvasElement[] = [];
      try {
        const pdfPage = await documentProxy.getPage(pageNumber);
        if (disposed) {
          cleanupPdfPage(pdfPage);
          return;
        }
        if (revision !== current) return;
        detailPage = pdfPage;
        const base = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({ scale: width / base.width });
        for (
          let y = Math.floor(top / TILE_SIZE) * TILE_SIZE;
          y < bottom;
          y += TILE_SIZE
        )
          for (
            let x = Math.floor(left / TILE_SIZE) * TILE_SIZE;
            x < right;
            x += TILE_SIZE
          ) {
            const tile = document.createElement("canvas");
            const tileWidth = Math.min(TILE_SIZE, width - x),
              tileHeight = Math.min(TILE_SIZE, height - y);
            tile.width = Math.ceil(tileWidth * dpr);
            tile.height = Math.ceil(tileHeight * dpr);
            tile.dataset.pdfDetail = String(dpr);
            Object.assign(tile.style, {
              left: `${x}px`,
              top: `${y}px`,
              width: `${tileWidth}px`,
              height: `${tileHeight}px`,
            });
            const task = pdfPage.render({
              canvas: tile,
              canvasContext: tile.getContext("2d")!,
              viewport,
              transform: [dpr, 0, 0, dpr, -x * dpr, -y * dpr],
            });
            tiles.push(tile);
            tasks.push(task);
          }
        await Promise.all(tasks.map((task) => task.promise));
        if (disposed || revision !== current) {
          release(tiles);
          return;
        }
        // Rendering takes a beat; by the time the tiles land the preview may
        // have gone back to device density (a zoom reset while they painted),
        // and committing them then left sharp tiles parked over a page that no
        // longer needs them. Re-check the reason they exist.
        if (!needsDetail()) {
          release(tiles);
          clear();
          return;
        }
        clear();
        layer.dataset.pdfZoom = canvas.dataset.pdfZoom;
        layer.style.width = `${width}px`;
        layer.style.height = `${height}px`;
        layer.style.transform = `scale(${ratio})`;
        layer.replaceChildren(...tiles);
      } catch (error) {
        // Navigation/scroll can cancel tiles; the rendered preview stays usable.
        release(tiles);
        if (!disposed && revision === current)
          recordDiagnostic("warn", "pdf.detail", error);
      }
    };
    const schedule = () => {
      cancel();
      window.clearTimeout(timer);
      if (stage.dataset.pdfZooming === "true") return;
      // At the fitted zoom the preview already covers the sheet, so the sharp
      // tiles above it are stale. Clear them now instead of debouncing: a reset
      // to 100% otherwise left them scaled over the page for a second or more
      // while scroll and resize events kept restarting the timer.
      if (!needsDetail()) {
        clear();
        return;
      }
      timer = window.setTimeout(() => {
        void render();
      }, 120);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(host);
    resize.observe(stage);
    const paint = new MutationObserver(schedule);
    paint.observe(canvas, {
      attributes: true,
      attributeFilter: [
        "data-pdf-zoom",
        "data-pdf-width",
        "data-pdf-page-number",
        "width",
        "height",
      ],
    });
    stage.addEventListener("scroll", schedule, { passive: true });
    stage.addEventListener("pdfzoomstart", schedule);
    stage.addEventListener("pdfzoomend", schedule);
    schedule();
    return () => {
      disposed = true;
      const pending = tasks.map((task) => task.promise);
      cancel();
      clearTimeout(timer);
      resize.disconnect();
      paint.disconnect();
      stage.removeEventListener("scroll", schedule);
      stage.removeEventListener("pdfzoomstart", schedule);
      stage.removeEventListener("pdfzoomend", schedule);
      clear();
      void Promise.allSettled(pending).then(() => cleanupPdfPage(detailPage));
    };
  }, [documentProxy, pageNumber, stage]);
  return <div ref={layerRef} className="pdf-detail-layer" aria-hidden="true" />;
}
