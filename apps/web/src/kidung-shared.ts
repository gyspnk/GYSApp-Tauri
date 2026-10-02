import {
  HymnCatalogEntrySchema,
  HymnMetadataSchema,
  type HymnMetadata,
  type HymnCatalogEntry,
} from "@gys/contracts";

export type CatalogState<T = HymnCatalogEntry> =
  | { status: "loading" }
  | { status: "ready"; items: T[] }
  | { status: "error"; message: string };

export function parseCatalog(value: unknown): HymnCatalogEntry[] {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as { items?: unknown }).items)
  )
    throw new Error("Hymn catalog is invalid");
  return (value as { items: unknown[] }).items.map((item) =>
    HymnCatalogEntrySchema.parse(item),
  );
}

export function numberLabel(number: number, id?: string) {
  const canonicalNumber = id?.match(/^hymn-(\d{3}[a-z]?)$/i)?.[1];
  return canonicalNumber ?? String(number).padStart(3, "0");
}

export function hymnCollectionLabel(book: string) {
  return book
    .split("-")
    .map((word) => word.charAt(0).toLocaleUpperCase("id-ID") + word.slice(1))
    .join(" ");
}

export function formatMidiTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function uniqueItems<T extends HymnMetadata>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.assetCode ?? item.book}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseHymnMetadata(value: unknown): HymnMetadata[] {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as { items?: unknown }).items)
  )
    throw new Error("Hymn metadata is invalid");
  return (value as { items: unknown[] }).items.map((item) =>
    HymnMetadataSchema.parse(item),
  );
}
