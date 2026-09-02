import {
  LiteratureCatalogSchema,
  LiteratureItemSchema,
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

const CATALOG_PERSIST_KEY = "gys_literature_catalog_v1";
const REVALIDATE_THROTTLE_MS = 60_000;

let catalogMemoryCache: LiteratureItem[] | undefined;
let catalogRevalidateAt = 0;
let catalogRevalidateInFlight = false;

const LITERATURE_UPDATE_EVENT = "gys-literature-update";

/** Pushes incrementally merged catalogs to open surfaces without reloading. */
export function subscribeLiterature(
  listener: (items: LiteratureItem[]) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onUpdate = (event: Event) => {
    const items = (event as CustomEvent<LiteratureItem[]>).detail;
    if (Array.isArray(items)) listener([...items]);
  };
  window.addEventListener(LITERATURE_UPDATE_EVENT, onUpdate);
  return () => window.removeEventListener(LITERATURE_UPDATE_EVENT, onUpdate);
}

function publishLiteratureUpdate(items: LiteratureItem[]) {
  if (
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function"
  )
    return;
  window.dispatchEvent(
    new CustomEvent<LiteratureItem[]>(LITERATURE_UPDATE_EVENT, {
      detail: [...items],
    }),
  );
}

function readPersistedCatalog(): LiteratureItem[] | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    if (!window.localStorage) return undefined;
    const raw = window.localStorage.getItem(CATALOG_PERSIST_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    const items =
      parsed && typeof parsed === "object" && "items" in parsed
        ? (parsed as { items?: unknown }).items
        : parsed;
    if (!Array.isArray(items) || !items.length) return undefined;
    // The persisted payload stores items only (envelope metadata is not
    // guaranteed), so validate each entry against the item schema directly.
    const valid = items.flatMap((entry: unknown) => {
      const result = LiteratureItemSchema.safeParse(entry);
      return result.success ? [result.data] : [];
    });
    if (!valid.length) return undefined;
    return [...new Map(valid.map((item) => [item.id, item])).values()].sort(
      (left, right) =>
        (right.publishedAt ?? right.updatedAt).localeCompare(
          left.publishedAt ?? left.updatedAt,
        ),
    );
  } catch {
    return undefined;
  }
}

function persistCatalog(items: LiteratureItem[]) {
  if (typeof window === "undefined") return;
  try {
    if (!window.localStorage) return;
    window.localStorage.setItem(
      CATALOG_PERSIST_KEY,
      JSON.stringify({ fetchedAt: new Date().toISOString(), items }),
    );
  } catch {
    // ignore storage quota errors
  }
}

/**
 * Union merge keyed by item id. Cached entries stay untouched unless the
 * upstream ships extra metadata, so revisits append newest additions instead
 * of re-rendering the whole shelf.
 */
function mergeCatalogs(
  current: LiteratureItem[],
  incoming: LiteratureItem[],
): LiteratureItem[] | undefined {
  if (!incoming.length) return undefined;
  const merged = new Map<string, LiteratureItem>();
  for (const item of incoming) merged.set(item.id, item);
  let changed = false;
  for (const item of current) {
    const existing = merged.get(item.id);
    if (!existing) {
      changed = true;
      merged.set(item.id, item);
      continue;
    }
    // Local entries often carry covers resolved earlier; keep the richer one.
    if (!existing.imageUrl && item.imageUrl) {
      changed = true;
      merged.set(item.id, { ...existing, imageUrl: item.imageUrl });
    }
  }
  if (!changed) return undefined;
  return [...merged.values()].sort((left, right) =>
    (right.publishedAt ?? right.updatedAt).localeCompare(
      left.publishedAt ?? left.updatedAt,
    ),
  );
}

function bffCandidates(): string[] {
  const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
  const isCrossPortLocalhost =
    typeof window !== "undefined" &&
    Boolean(
      base &&
      (base.includes("127.0.0.1") || base.includes("localhost")) &&
      !base.includes(`:${window.location.port}`),
    );
  const proxy = isCrossPortLocalhost
    ? undefined
    : `${(base ?? "").replace(/\/$/, "")}/api/v1/content/literature`;
  return [
    proxy,
    `${import.meta.env.BASE_URL}offline/literature.json`,
  ].filter((value): value is string => Boolean(value));
}

export async function fetchLiteratureCatalog(
  signal?: AbortSignal,
): Promise<LiteratureItem[]> {
  if (!catalogMemoryCache?.length) {
    const hydrated = readPersistedCatalog();
    if (hydrated?.length) catalogMemoryCache = hydrated;
  }
  if (catalogMemoryCache && catalogMemoryCache.length > 0) {
    scheduleCatalogRevalidate();
    return [...catalogMemoryCache];
  }
  const controller = signal ? undefined : new AbortController();
  const catalog = await loadCatalog(signal ?? controller!.signal);
  const items = [
    ...new Map(catalog.items.map((item) => [item.id, item])).values(),
  ];
  catalogMemoryCache = items;
  persistCatalog(items);
  return items;
}

export function getCachedLiteratureCatalog(): LiteratureItem[] | undefined {
  if (catalogMemoryCache?.length) return catalogMemoryCache;
  const hydrated = readPersistedCatalog();
  if (hydrated?.length) {
    catalogMemoryCache = hydrated;
    scheduleCatalogRevalidate();
    return hydrated;
  }
  return undefined;
}

/**
 * Background refresh for revisits: merges only upstream additions into the
 * cached catalog and notifies subscribers; failures keep the painted cache.
 */
function scheduleCatalogRevalidate() {
  if (catalogRevalidateInFlight) return;
  const now = Date.now();
  if (now < catalogRevalidateAt) return;
  catalogRevalidateInFlight = true;
  catalogRevalidateAt = now + REVALIDATE_THROTTLE_MS;
  // Off the paint path: refreshing never blocks first render.
  window.setTimeout(() => {
    void (async () => {
      try {
        const current = [...(catalogMemoryCache ?? [])];
        const next = await loadMergedCatalog(current);
        if (next) {
          catalogMemoryCache = next;
          persistCatalog(next);
          publishLiteratureUpdate(next);
        }
      } catch (error) {
        recordDiagnostic("warn", "literature.revalidate", error);
      } finally {
        catalogRevalidateInFlight = false;
      }
    })();
  }, 50);
}

async function loadMergedCatalog(current: LiteratureItem[]) {
  for (const url of bffCandidates()) {
    try {
      const response = await fetch(url, { cache: "default" });
      if (!response.ok)
        throw new Error(`Literature request failed: ${response.status}`);
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("text/html"))
        throw new Error(`Expected JSON from ${url}, got HTML`);
      const incoming = LiteratureCatalogSchema.parse(await response.json());
      const covers = new Map(
        current
          .filter((item) => item.imageUrl)
          .map((item) => [item.id, item.imageUrl]),
      );
      const normalized = incoming.items.map((item) =>
        item.imageUrl || !covers.get(item.id)
          ? item
          : { ...item, imageUrl: covers.get(item.id) },
      );
      return mergeCatalogs(current, normalized);
    } catch {
      // try the next candidate
    }
  }
  return undefined;
}

async function loadCatalog(signal: AbortSignal) {
  const candidates = bffCandidates();
  let lastError: unknown;
  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        signal,
        cache: "default",
      });
      if (!response.ok)
        throw new Error(`Literature request failed: ${response.status}`);
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("text/html"))
        throw new Error(`Expected JSON from ${url}, got HTML`);
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
