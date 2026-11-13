import { HymnCatalogEntrySchema, type HymnCatalogEntry } from "@gys/contracts";
import type { DistributedAssetStore } from "./distributed-asset-store.js";

const HYMNAL_CONFIG = {
  HYMNE: { book: "english", folder: "hymne" },
  MDR: { book: "mandarin", folder: "mdr" },
  // Each Aku Senang Menyanyi volume is its own book; merging them under one
  // "anak" category hid the volume a reader actually wanted.
  "ASM-I": { book: "ASM-I", folder: "asm_i" },
  "ASM-M": { book: "ASM-M", folder: "asm_m" },
  "ASM-P": { book: "ASM-P", folder: "asm_p" },
} as const;

export function normalizeDistributedHymnIndex(
  code: string,
  value: unknown,
): HymnCatalogEntry[] {
  const config = HYMNAL_CONFIG[code as keyof typeof HYMNAL_CONFIG];
  if (!config || !Array.isArray(value))
    throw new Error(`Invalid ${code} hymn index`);
  const entries = value.map((entry): HymnCatalogEntry => {
    if (!entry || typeof entry !== "object")
      throw new Error(`Invalid ${code} hymn`);
    const song = entry as Record<string, unknown>;
    const number = Number.parseInt(String(song.number), 10);
    const verses = Array.isArray(song.verses)
      ? song.verses
          .map(String)
          .map((verse) => verse.trim())
          .filter(Boolean)
      : [];
    if (
      !Number.isInteger(number) ||
      number <= 0 ||
      typeof song.title !== "string" ||
      !song.title.trim() ||
      verses.length === 0 ||
      typeof song.pdfFile !== "string"
    )
      throw new Error(`Invalid ${code} hymn ${String(song.number ?? "")}`);
    const midiFile =
      typeof song.midiFile === "string" && song.midiFile.trim()
        ? song.midiFile.replace(/^midi\//, "")
        : `${config.folder}/${String(number).padStart(3, "0")}.mid`;
    return HymnCatalogEntrySchema.parse({
      id: `${code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${String(number).padStart(3, "0")}`,
      assetCode: code,
      book: config.book,
      number,
      title: song.title.trim(),
      verses,
      lyrics: verses.join("\n\n"),
      midiPath: `assets/midi/${midiFile}`,
      pdfPath: `assets/data/${song.pdfFile}`,
      ...(Number.isInteger(song.page) && Number(song.page) > 0
        ? { pdfPage: Number(song.page) }
        : {}),
      ...(Number.isInteger(song.pages) && Number(song.pages) > 0
        ? { pdfPages: Number(song.pages) }
        : {}),
    });
  });
  return fillMissingHymnPages(entries);
}

/**
 * A song whose index entry has no page would open the whole book in score
 * mode — the Mandarin master is 559 pages, so one hymn looked like hundreds.
 * The index lists songs in book order and every mapped song says where it
 * starts, so an unmapped run that fits exactly between a known song's end and
 * the next known start is that run; anything that does not fit stays unmapped
 * rather than pointing at the wrong page.
 */
export function fillMissingHymnPages<
  T extends { pdfPage?: number | undefined; pdfPages?: number | undefined },
>(entries: readonly T[]): T[] {
  const filled = entries.map((entry) => {
    const copy = { ...entry };
    if (copy.pdfPage !== undefined && copy.pdfPages === undefined)
      copy.pdfPages = 1;
    return copy;
  });
  let index = 0;
  while (index < filled.length) {
    if (filled[index]?.pdfPage !== undefined) {
      index += 1;
      continue;
    }
    const start = index;
    while (index < filled.length && filled[index]?.pdfPage === undefined)
      index += 1;
    const previous = start > 0 ? filled[start - 1] : undefined;
    const next = index < filled.length ? filled[index] : undefined;
    if (!previous?.pdfPage || !next?.pdfPage) continue;
    const previousEnd = previous.pdfPage + (previous.pdfPages ?? 1) - 1;
    const run = index - start;
    if (next.pdfPage - previousEnd - 1 < run) continue;
    for (let offset = 0; offset < run; offset += 1) {
      const target = filled[start + offset]!;
      filled[start + offset] = {
        ...target,
        pdfPage: previousEnd + 1 + offset,
        pdfPages: 1,
      };
    }
  }
  return filled;
}

export async function loadInstalledDistributedHymnCatalog(
  store: DistributedAssetStore,
): Promise<HymnCatalogEntry[]> {
  const records = await store.listRecords();
  const installed = records.filter(
    (record) => record.kind === "hymnal" && record.metadataCacheKey,
  );
  const catalogs = await Promise.all(
    installed.map(async (record) => {
      const bytes = await store.getMetadataBytes(record.code);
      if (!bytes) return [];
      return normalizeDistributedHymnIndex(
        record.code,
        JSON.parse(new TextDecoder().decode(bytes)),
      );
    }),
  );
  return catalogs.flat();
}

export function distributedHymnPdfCode(
  item: Pick<HymnCatalogEntry, "assetCode">,
): string | undefined {
  return item.assetCode;
}

export async function loadInstalledDistributedHymnalPdf(
  item: Pick<HymnCatalogEntry, "assetCode" | "pdfPage" | "pdfPages">,
  store: DistributedAssetStore,
): Promise<{
  bytes: Uint8Array;
  src: string;
  initialPage: number;
  pageCount?: number;
  sourceVersion: string;
}> {
  const code = distributedHymnPdfCode(item);
  if (!code) throw new Error("Hymnal asset code is missing");
  const [bytes, record] = await Promise.all([
    store.getBytes(code),
    store.getRecord(code),
  ]);
  if (!bytes || !record)
    throw new Error(`Hymnal asset is not installed: ${code}`);
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new Error(`Hymnal asset is not a PDF: ${code}`);
  }
  const src = URL.createObjectURL(
    new Blob([bytes.slice().buffer as ArrayBuffer], {
      type: "application/pdf",
    }),
  );
  return {
    bytes,
    src,
    initialPage: item.pdfPage ?? 1,
    ...(item.pdfPages ? { pageCount: item.pdfPages } : {}),
    sourceVersion: `${code}:${record.version}`,
  };
}
