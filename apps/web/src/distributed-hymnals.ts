import { HymnCatalogEntrySchema, type HymnCatalogEntry } from "@gys/contracts";
import type { DistributedAssetStore } from "./distributed-asset-store.js";

export const DISTRIBUTED_HYMN_CATALOG_URL = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/offline/distributed-hymn-catalog.json`;

type DistributedHymnCatalog = {
  version: 1;
  sourceRepo: string;
  sourceCommit: string;
  generatedAt: string;
  catalogs: Array<{ code: string; title: string; items: unknown[] }>;
};

let catalogPromise: Promise<HymnCatalogEntry[]> | undefined;

function parseCatalog(value: unknown): HymnCatalogEntry[] {
  if (!value || typeof value !== "object")
    throw new Error("Distributed hymn catalog is invalid");
  const raw = value as Partial<DistributedHymnCatalog>;
  if (raw.version !== 1 || !Array.isArray(raw.catalogs)) {
    throw new Error("Distributed hymn catalog is invalid");
  }
  return raw.catalogs.flatMap((catalog) =>
    Array.isArray(catalog.items)
      ? catalog.items.map((item) => HymnCatalogEntrySchema.parse(item))
      : [],
  );
}

export async function loadDistributedHymnCatalog(
  fetcher: typeof fetch = fetch,
): Promise<HymnCatalogEntry[]> {
  catalogPromise ??= fetcher(DISTRIBUTED_HYMN_CATALOG_URL, {
    cache: "force-cache",
    headers: { accept: "application/json" },
  }).then(async (response) => {
    if (!response.ok)
      throw new Error(`Distributed hymn catalog failed: ${response.status}`);
    return parseCatalog(await response.json());
  });
  try {
    return await catalogPromise;
  } catch (error) {
    catalogPromise = undefined;
    throw error;
  }
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
