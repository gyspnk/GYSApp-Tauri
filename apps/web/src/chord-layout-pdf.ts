import {
  getDocument,
  GlobalWorkerOptions,
  type PDFPageProxy,
} from "pdfjs-dist";
import { workerSrc } from "./pdf-worker.js";
import {
  buildChordedLines,
  extractLyricLines,
  extractPageNotes,
  resolveChordMarker,
  type ChordedLine,
  type ChordLayoutEntry,
  type PdfTextItem,
} from "./chord-layout.js";
import { pdfDocumentSourceOptions } from "./pdf-utils.js";

GlobalWorkerOptions.workerSrc = workerSrc;

export type ChordLayoutPage = {
  page: number;
  lines: ChordedLine[];
};

/** A semantic marker rendered above a PDF canvas, never baked into the PDF. */
export type ChordOverlayMarker = {
  page: number;
  noteIdx: number;
  chord: string;
  xPct: number;
  yPct: number;
};

export type ChordPresentationLayout = {
  layout: ChordLayoutPage[];
  overlays: Record<string, ChordOverlayMarker[]>;
};

type ExtractedPageLayout = {
  notes: ReturnType<typeof extractPageNotes>;
  lyrics: ReturnType<typeof extractLyricLines>;
};

// PDF text extraction is considerably more expensive than updating chord
// labels. Keep a small resource-versioned cache so transpose/show-hide and
// PDF/Text switches reuse the same page model.
const pageLayoutCache = new Map<string, Map<number, ExtractedPageLayout>>();
const MAX_PAGE_LAYOUT_CACHE = 24;

function rememberPageLayout(
  resourceKey: string | undefined,
  page: number,
  value: ExtractedPageLayout,
): void {
  // Never share an unversioned page model between songs.
  if (!resourceKey) return;
  const key = resourceKey;
  const existing =
    pageLayoutCache.get(key) ?? new Map<number, ExtractedPageLayout>();
  existing.set(page, value);
  pageLayoutCache.delete(key);
  pageLayoutCache.set(key, existing);
  while (pageLayoutCache.size > MAX_PAGE_LAYOUT_CACHE)
    pageLayoutCache.delete(pageLayoutCache.keys().next().value as string);
}

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
          // The canonical viewer trims PDF.js text items before detecting
          // notation. Keeping the same boundary avoids shifting note slots
          // when a font embeds surrounding whitespace.
          str: raw.str.trim(),
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
 * verified song PDF. The PDF is parsed only while the shared chord capability
 * is requested; no PDF bytes are persisted by this helper.
 */
export async function buildChordLayoutFromPdf(
  source: Uint8Array | string,
  pages: Record<string, ChordLayoutEntry[]>,
  resourceKey?: string,
): Promise<ChordLayoutPage[]> {
  const presentation = await buildChordPresentationFromPdf(
    source,
    pages,
    resourceKey,
  );
  return presentation.layout;
}

/**
 * Extract the canonical page model once and expose both consumers:
 * - the Text presentation uses relative lyric-line positions;
 * - the PDF presentation uses note coordinates for a DOM overlay.
 */
export async function buildChordPresentationFromPdf(
  source: Uint8Array | string,
  pages: Record<string, ChordLayoutEntry[]>,
  resourceKey?: string,
): Promise<ChordPresentationLayout> {
  const task = getDocument(
    typeof source === "string"
      ? pdfDocumentSourceOptions(source)
      : pdfDocumentSourceOptions("", source),
  );
  const document = await task.promise;
  try {
    const output: ChordLayoutPage[] = [];
    const overlays: Record<string, ChordOverlayMarker[]> = {};
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
      const cached = resourceKey
        ? pageLayoutCache.get(resourceKey)?.get(pageNumber)
        : undefined;
      const pageLayout =
        cached ??
        (await (async () => {
          const items = await textItems(page);
          const notes = extractPageNotes(
            items,
            viewport.width,
            viewport.height,
          );
          const lyrics = extractLyricLines(items, viewport.width);
          const next = { notes, lyrics } satisfies ExtractedPageLayout;
          rememberPageLayout(resourceKey, pageNumber, next);
          return next;
        })());
      const { notes, lyrics } = pageLayout;
      if (notes.notes.length === 0) continue;
      const markers: ChordOverlayMarker[] = [];
      for (const entry of entries) {
        const note = resolveChordMarker(notes.notes, entry.noteIdx);
        if (!note) continue;
        markers.push({
          page: pageNumber,
          noteIdx: entry.noteIdx,
          chord: entry.chord,
          xPct: Math.max(0, Math.min(100, note.xPct)),
          yPct: Math.max(0, Math.min(100, note.yPct)),
        });
      }
      if (markers.length > 0) overlays[String(pageNumber)] = markers;
      const lines = buildChordedLines(
        notes.notes,
        notes.noteRows,
        lyrics,
        entries,
      );
      if (lines.length > 0) output.push({ page: pageNumber, lines });
    }
    return { layout: output, overlays };
  } finally {
    await task.destroy();
  }
}

export async function buildChordOverlayFromPdf(
  source: Uint8Array | string,
  pages: Record<string, ChordLayoutEntry[]>,
  resourceKey?: string,
): Promise<Record<string, ChordOverlayMarker[]>> {
  return (await buildChordPresentationFromPdf(source, pages, resourceKey))
    .overlays;
}
