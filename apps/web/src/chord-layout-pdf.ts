import {
  getDocument,
  GlobalWorkerOptions,
  type PDFPageProxy,
} from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  buildChordedLines,
  extractLyricLines,
  extractPageNotes,
  type ChordedLine,
  type ChordLayoutEntry,
  type PdfTextItem,
} from "./chord-layout.js";

GlobalWorkerOptions.workerSrc = workerSrc;

export type ChordLayoutPage = {
  page: number;
  lines: ChordedLine[];
};

function textItems(page: PDFPageProxy): Promise<PdfTextItem[]> {
  return page.getTextContent().then((content) =>
    content.items.flatMap((raw) => {
      if (!("str" in raw) || !Array.isArray(raw.transform)) return [];
      const transform = raw.transform as number[];
      const x = Number(transform[4]);
      const y = Number(transform[5]);
      const width = Number(raw.width);
      const fontSize = Math.abs(Number(transform[3]));
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(width) ||
        !Number.isFinite(fontSize)
      )
        return [];
      return [
        {
          str: raw.str,
          x,
          y,
          width,
          fontSize,
        },
      ];
    }),
  );
}

/**
 * Builds the same note-aligned layout as the canonical viewer from a
 * verified song PDF. The PDF is parsed only while the chord surface is open;
 * no PDF bytes or parsed pages are persisted by this helper.
 */
export async function buildChordLayoutFromPdf(
  data: Uint8Array,
  pages: Record<string, ChordLayoutEntry[]>,
): Promise<ChordLayoutPage[]> {
  const task = getDocument({ data: data.slice() });
  const document = await task.promise;
  try {
    const output: ChordLayoutPage[] = [];
    const pageNumbers = Object.keys(pages)
      .map(Number)
      .filter(
        (page) =>
          Number.isInteger(page) && page > 0 && page <= document.numPages,
      )
      .sort((a, b) => a - b);
    for (const pageNumber of pageNumbers) {
      const entries = pages[String(pageNumber)] ?? [];
      if (entries.length === 0) continue;
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const items = await textItems(page);
      const notes = extractPageNotes(items, viewport.width, viewport.height);
      if (notes.notes.length === 0) continue;
      const lyrics = extractLyricLines(items, viewport.width);
      const lines = buildChordedLines(
        notes.notes,
        notes.noteRows,
        lyrics,
        entries,
      );
      if (lines.length > 0) output.push({ page: pageNumber, lines });
    }
    return output;
  } finally {
    await task.destroy();
  }
}
