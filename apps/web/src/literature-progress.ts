export type LiteratureLocation =
  | { kind: "page"; page: number; totalPages: number }
  | { kind: "scroll"; ratio: number };

export type LiteratureProgress = {
  version: 2;
  percent: number;
  updatedAt: string;
  lastOpenedAt: string;
  resourceVersion: string;
  location?: LiteratureLocation;
  downloadedAt?: string;
  completed?: boolean;
};

// ponytail: undated upstream items keep one stable version; invalidate them
// when the catalog starts supplying a real source date.
export const UNDATED_LITERATURE_RESOURCE_VERSION = "1970-01-01T00:00:00.000Z";

export function literatureResourceVersion(publishedAt?: string): string {
  return publishedAt ?? UNDATED_LITERATURE_RESOURCE_VERSION;
}

export function isLiteratureProgressCompatible(
  progress: Pick<LiteratureProgress, "resourceVersion"> | undefined,
  item: { publishedAt?: string | undefined },
): boolean {
  return Boolean(
    progress &&
    (!item.publishedAt ||
      progress.resourceVersion ===
        literatureResourceVersion(item.publishedAt) ||
      progress.resourceVersion === "legacy"),
  );
}

export function literaturePagePercent(
  page: number,
  totalPages: number,
): number {
  if (!Number.isFinite(page) || !Number.isFinite(totalPages) || page <= 0)
    return 0;
  return Math.min(
    100,
    Math.max(1, Math.round((page / Math.max(1, totalPages)) * 100)),
  );
}

export const LITERATURE_PROGRESS_KEY = "gys-literature-progress-v2";
const LEGACY_PROGRESS_KEY = "gys-literature-progress-v1";
const CHANGE_EVENT = "gys-literature-progress-change";

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function validLocation(value: unknown): value is LiteratureLocation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const location = value as Record<string, unknown>;
  if (location.kind === "page") {
    return (
      Number.isInteger(location.page) &&
      Number(location.page) > 0 &&
      Number.isInteger(location.totalPages) &&
      Number(location.totalPages) > 0 &&
      Number(location.page) <= Number(location.totalPages)
    );
  }
  return (
    location.kind === "scroll" &&
    typeof location.ratio === "number" &&
    Number.isFinite(location.ratio) &&
    location.ratio >= 0 &&
    location.ratio <= 1
  );
}

export function normalizeLiteratureProgress(
  value: unknown,
  resourceVersion: string,
): LiteratureProgress | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const entry = value as Record<string, unknown>;
  const percent = Number(entry.percent);
  const updatedAt = isIsoDate(entry.updatedAt)
    ? entry.updatedAt
    : new Date().toISOString();
  const lastOpenedAt = isIsoDate(entry.lastOpenedAt)
    ? entry.lastOpenedAt
    : updatedAt;
  const version =
    typeof entry.resourceVersion === "string" && entry.resourceVersion
      ? entry.resourceVersion
      : resourceVersion;
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return;
  const location = validLocation(entry.location) ? entry.location : undefined;
  return {
    version: 2,
    percent: Math.round(Math.min(100, Math.max(0, percent))),
    updatedAt,
    lastOpenedAt,
    resourceVersion: version,
    ...(location ? { location } : {}),
    ...(isIsoDate(entry.downloadedAt)
      ? { downloadedAt: entry.downloadedAt }
      : {}),
    ...(entry.completed === true ? { completed: true } : {}),
  };
}

function readRaw(key: string): unknown {
  if (typeof window === "undefined") return undefined;
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}");
  } catch {
    return undefined;
  }
}

function readMapFrom(key: string): Record<string, unknown> {
  const parsed = readRaw(key);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

export function readLiteratureProgress(
  resourceVersions?: ReadonlyMap<string, string>,
): Record<string, LiteratureProgress> {
  const current = readMapFrom(LITERATURE_PROGRESS_KEY);
  const legacy = readMapFrom(LEGACY_PROGRESS_KEY);
  const result: Record<string, LiteratureProgress> = {};
  for (const [id, value] of Object.entries({ ...legacy, ...current })) {
    const resourceVersion = resourceVersions?.get(id) ?? "legacy";
    const normalized = normalizeLiteratureProgress(value, resourceVersion);
    if (normalized) result[id] = normalized;
  }
  return result;
}

export function saveLiteratureProgress(
  id: string,
  progress: LiteratureProgress,
): void {
  if (typeof window === "undefined") return;
  const next = readLiteratureProgress();
  next[id] = progress;
  localStorage.setItem(LITERATURE_PROGRESS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function removeLiteratureProgress(id: string): void {
  if (typeof window === "undefined") return;
  const current = readMapFrom(LITERATURE_PROGRESS_KEY);
  const legacy = readMapFrom(LEGACY_PROGRESS_KEY);
  const hadCurrent = Object.hasOwn(current, id);
  const hadLegacy = Object.hasOwn(legacy, id);
  if (!hadCurrent && !hadLegacy) return;

  if (hadCurrent) {
    delete current[id];
    localStorage.setItem(LITERATURE_PROGRESS_KEY, JSON.stringify(current));
  }
  if (hadLegacy) {
    delete legacy[id];
    localStorage.setItem(LEGACY_PROGRESS_KEY, JSON.stringify(legacy));
  }

  const pagePrefix = `gys-pdf-page:literature:${id}:`;
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(pagePrefix)) localStorage.removeItem(key);
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function subscribeLiteratureProgress(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => listener();
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

export function getRecentLiteratureIds(limit = 12): string[] {
  return Object.entries(readLiteratureProgress())
    .sort(([, left], [, right]) =>
      right.lastOpenedAt.localeCompare(left.lastOpenedAt),
    )
    .slice(0, limit)
    .map(([id]) => id);
}

export function isResumeLocationValid(
  location: LiteratureLocation | undefined,
  resourceVersion: string,
  expectedPageCount?: number,
  storedResourceVersion?: string,
): boolean {
  if (
    !location ||
    (storedResourceVersion && storedResourceVersion !== resourceVersion)
  )
    return false;
  if (location.kind === "scroll") return true;
  return (
    location.page > 0 &&
    location.page <= location.totalPages &&
    (expectedPageCount === undefined || location.page <= expectedPageCount)
  );
}
