/**
 * One worker URL shared by the PDF reader and note-aligned chord extractor.
 * Keeping the import at a single module boundary lets Vite emit one local
 * PDF.js worker chunk instead of duplicating it across lazy route chunks.
 */
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export { workerSrc };
