import {
  LiteratureCatalogSchema,
  type LiteratureCategory,
  type LiteratureItem,
} from "@gys/contracts";
import { recordDiagnostic } from "./diagnostics.js";

export const literatureCategoryLabels: Record<
  LiteratureCategory | "all",
  string
> = {
  all: "Semua koleksi",
  kesaksian: "Kesaksian",
  warta: "Warta Sejati",
  panduan: "Panduan Alkitab",
  renungan: "Renungan",
  "pelita-kecil": "Pelita Kecil",
  pujian: "Pujian",
  buku: "Buku PDF",
};

let catalogMemoryCache: LiteratureItem[] | undefined;

export async function fetchLiteratureCatalog(
  signal?: AbortSignal,
): Promise<LiteratureItem[]> {
  if (catalogMemoryCache && catalogMemoryCache.length > 0) {
    return catalogMemoryCache;
  }
  const controller = signal ? undefined : new AbortController();
  const catalog = await loadCatalog(signal ?? controller!.signal);
  const items = [
    ...new Map(catalog.items.map((item) => [item.id, item])).values(),
  ];
  catalogMemoryCache = items;
  return items;
}

export function getCachedLiteratureCatalog(): LiteratureItem[] | undefined {
  return catalogMemoryCache;
}

async function loadCatalog(signal: AbortSignal) {
  const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
  const isCrossPortLocalhost =
    typeof window !== "undefined" &&
    Boolean(
      base &&
      (base.includes("127.0.0.1") || base.includes("localhost")) &&
      !base.includes(`:${window.location.port}`),
    );
  const candidates = [
    isCrossPortLocalhost
      ? undefined
      : `${(base ?? "").replace(/\/$/, "")}/api/v1/content/literature`,
    `${import.meta.env.BASE_URL}offline/literature.json`,
  ].filter((value): value is string => Boolean(value));
  let lastError: unknown;
  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        signal,
        cache: "default",
      });
      if (!response.ok)
        throw new Error(`Literature request failed: ${response.status}`);
      const catalog = LiteratureCatalogSchema.parse(await response.json());
      if (url !== `${import.meta.env.BASE_URL}offline/literature.json`) {
        try {
          const snapshotResponse = await fetch(
            `${import.meta.env.BASE_URL}offline/literature.json`,
            { signal, cache: "force-cache" },
          );
          if (snapshotResponse.ok) {
            const snapshot = LiteratureCatalogSchema.parse(
              await snapshotResponse.json(),
            );
            const covers = new Map(
              snapshot.items
                .filter((item) => item.imageUrl)
                .map((item) => [item.id, item.imageUrl]),
            );
            return {
              ...catalog,
              items: catalog.items.map((item) => ({
                ...item,
                ...(item.imageUrl || !covers.get(item.id)
                  ? {}
                  : { imageUrl: covers.get(item.id) }),
              })),
            };
          }
        } catch {
          // BFF catalog remains usable without optional cover map
        }
      }
      return catalog;
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
    }
  }
  const failure =
    lastError instanceof Error
      ? lastError
      : new Error("Literature catalog unavailable");
  recordDiagnostic("error", "literature.catalog", failure);
  throw failure;
}
