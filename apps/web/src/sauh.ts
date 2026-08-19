import { SauhPostSchema, type SauhPost } from "@gys/contracts";
import { recordDiagnostic } from "./diagnostics.js";

const STATIC_URL = `${import.meta.env.BASE_URL}offline/sauh.json`;
const SAUH_UPDATE_EVENT = "gys-sauh-update";
const WORDPRESS_URL =
  "https://tjc.org/id/wp-json/wp/v2/posts?categories=229&per_page=6&orderby=date&order=desc&_embed=wp:featuredmedia";
const CACHE_TTL_MS = 5 * 60_000;

let cachedToday:
  { dayKey: string; expiresAt: number; items: SauhPost[] } | undefined;
let inFlightToday: { dayKey: string; promise: Promise<SauhPost[]> } | undefined;

/**
 * Let the verified snapshot paint immediately, then publish a live TJC
 * response when revalidation finishes so readers do not need a route reload.
 */
export function subscribeSauh(
  listener: (items: SauhPost[]) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onUpdate = (event: Event) => {
    const items = (event as CustomEvent<SauhPost[]>).detail;
    if (Array.isArray(items)) listener([...items]);
  };
  window.addEventListener(SAUH_UPDATE_EVENT, onUpdate);
  return () => window.removeEventListener(SAUH_UPDATE_EVENT, onUpdate);
}

function publishSauhUpdate(items: SauhPost[]) {
  if (
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function"
  )
    return;
  window.dispatchEvent(
    new CustomEvent<SauhPost[]>(SAUH_UPDATE_EVENT, { detail: [...items] }),
  );
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, value: string) =>
      String.fromCodePoint(Math.min(0x10ffff, Number(value))),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, value: string) =>
      String.fromCodePoint(Math.min(0x10ffff, Number.parseInt(value, 16))),
    );
}

export function stripHtml(value: string): string {
  const unsafeRemoved = value.replace(
    /<(script|style|iframe|object|embed|template|svg)[^>]*>[\s\S]*?<\/\1>/gi,
    " ",
  );
  if (typeof DOMParser !== "undefined") {
    const document = new DOMParser().parseFromString(
      unsafeRemoved,
      "text/html",
    );
    document
      .querySelectorAll("script,style,iframe,object,embed,template,svg")
      .forEach((element) => element.remove());
    document
      .querySelectorAll("br")
      .forEach((element) => element.replaceWith("\n"));
    document
      .querySelectorAll("p,h1,h2,h3,h4,h5,h6,li")
      .forEach((element) => element.append("\n"));
    return decodeEntities(document.body.textContent ?? "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return decodeEntities(
    unsafeRemoved
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>|<\/h[1-6]>|<\/li>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function firstParagraph(value: string): string {
  const text = stripHtml(value);
  return text.split(/\n+/)[0]?.trim() || text.slice(0, 440);
}

function referenceFrom(value: string): string | undefined {
  const parenthetical = value.match(/\(([^()]{2,80}\d+[^()]*)\)/);
  if (parenthetical?.[1]) return parenthetical[1].trim();
  return value.match(
    /\b(?:[1-3]\s*)?[A-ZÀ-Ý][\p{L}-]*(?:\s+[A-ZÀ-Ý][\p{L}-]*)*\s+\d+:\d+(?:-\d+)?\b/u,
  )?.[0];
}

function quoteFrom(value: string): string | undefined {
  const text = stripHtml(value);
  const quote = text.match(/[“"]([^“”"]{18,320})[”"]/);
  return (
    quote?.[1]?.trim() ?? text.split(/\n/).find((line) => line.length > 30)
  );
}

function isTjcUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      ["tjc.org", "www.tjc.org"].includes(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

/** Convert the WordPress post shape used by the upstream into our stable contract. */
export function parseSauhPosts(value: unknown): SauhPost[] {
  if (!Array.isArray(value)) {
    const envelope = value as { items?: unknown } | null;
    value = envelope?.items;
  }
  if (!Array.isArray(value)) return [];
  const parsed: SauhPost[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const post = item as {
      id?: unknown;
      slug?: unknown;
      date?: unknown;
      modified?: unknown;
      link?: unknown;
      title?: { rendered?: unknown } | string;
      content?: { rendered?: unknown };
      excerpt?: { rendered?: unknown };
      _embedded?: {
        [key: string]: Array<{ source_url?: unknown }> | undefined;
      };
      reference?: unknown;
      verse?: unknown;
      body?: unknown;
      url?: unknown;
    };
    const rawBody =
      typeof post.body === "string"
        ? post.body
        : typeof post.content?.rendered === "string"
          ? post.content.rendered
          : typeof post.excerpt?.rendered === "string"
            ? post.excerpt.rendered
            : "";
    const title =
      typeof post.title === "object" && typeof post.title?.rendered === "string"
        ? stripHtml(post.title.rendered)
        : typeof post.title === "string"
          ? stripHtml(post.title)
          : "";
    const body = stripHtml(rawBody).slice(0, 20_000);
    const sourceUrl = typeof post.url === "string" ? post.url : post.link;
    const updatedAt =
      typeof post.modified === "string"
        ? post.modified
        : typeof post.date === "string"
          ? post.date
          : undefined;
    const parsedUpdatedAt =
      typeof updatedAt === "string" ? new Date(updatedAt) : undefined;
    if (
      !title ||
      !body ||
      !isTjcUrl(sourceUrl) ||
      !parsedUpdatedAt ||
      Number.isNaN(parsedUpdatedAt.getTime())
    )
      continue;
    const reference =
      typeof post.reference === "string"
        ? post.reference
        : referenceFrom(stripHtml(rawBody));
    const verse =
      typeof post.verse === "string" ? post.verse : quoteFrom(rawBody);
    const embeddedImage = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
    const candidate = {
      id:
        typeof post.slug === "string"
          ? post.slug
          : `sauh-${String(post.id ?? parsed.length + 1)}`,
      title,
      ...(reference ? { reference } : {}),
      ...(verse ? { verse } : {}),
      body,
      url: sourceUrl,
      ...(isTjcUrl(embeddedImage) ? { imageUrl: embeddedImage } : {}),
      updatedAt: parsedUpdatedAt.toISOString(),
      source: "tjc.org" as const,
    };
    const result = SauhPostSchema.safeParse(candidate);
    if (result.success) parsed.push(result.data);
  }
  return parsed.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

function publisherDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function localDateKey(value: Date) {
  const { year, month, day } = publisherDateParts(value);
  return `${year}-${month}-${day}`;
}

export function expectedSauhSlug(date = new Date()): string {
  const { year, month, day } = publisherDateParts(date);
  return `sbj${year?.slice(-2)}${month}${day}`;
}

/** Prefer the same-origin BFF; direct WordPress remains the no-config fallback. */
export function sauhNetworkCandidates(bffBase?: string): string[] {
  const proxy = bffBase?.trim()
    ? `${bffBase.trim().replace(/\/$/, "")}/api/v1/content/sauh`
    : undefined;
  return [proxy, WORDPRESS_URL].filter((value): value is string =>
    Boolean(value),
  );
}

function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted)
    return Promise.reject(signal.reason ?? new Error("Request aborted"));
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(signal.reason ?? new Error("Request aborted"));
    };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

/** The home surface intentionally exposes only today's Sauh entry. */
export function onlyTodaySauh(posts: SauhPost[], now = new Date()): SauhPost[] {
  const today = localDateKey(now);
  return posts.filter(
    (post) => localDateKey(new Date(post.updatedAt)) === today,
  );
}

/**
 * WordPress can expose a post's modified timestamp in UTC after the local
 * calendar day has started. The daily slug is the publisher's canonical day
 * key, so use it as a narrow fallback without ever showing an arbitrary stale
 * reflection.
 */
export function selectTodaySauh(
  posts: SauhPost[],
  now = new Date(),
): SauhPost[] {
  // The publisher's date slug is authoritative. A post edited today must not
  // displace today's reflection merely because its modified timestamp wins.
  const canonical = posts.filter((post) => post.id === expectedSauhSlug(now));
  if (canonical.length) return canonical;
  const dated = onlyTodaySauh(posts, now);
  if (dated.length) return dated;
  return [];
}

/**
 * Offline snapshots can lag the publisher by a day between releases. Prefer
 * today's entry, but keep the newest verified snapshot readable instead of
 * turning an otherwise usable offline library into a blank error screen.
 */
export function selectOfflineSauh(
  posts: SauhPost[],
  now = new Date(),
): SauhPost[] {
  const today = selectTodaySauh(posts, now);
  return today.length ? today : posts.slice(0, 1);
}

function parseNormalizedSauh(value: unknown): SauhPost[] {
  const candidates =
    Array.isArray(value) || !value || typeof value !== "object"
      ? value
      : (value as { items?: unknown }).items;
  if (!Array.isArray(candidates)) return [];
  const parsed: SauhPost[] = [];
  for (const item of candidates) {
    const result = SauhPostSchema.safeParse(item);
    if (!result.success || !isTjcUrl(result.data.url)) continue;
    if (result.data.imageUrl && !isTjcUrl(result.data.imageUrl)) continue;
    parsed.push(result.data);
  }
  return parsed.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

async function request(url: string, signal?: AbortSignal): Promise<SauhPost[]> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 4_000);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      // Serve from the HTTP cache inside the BFF freshness window (max-age
      // 60s + stale-while-revalidate) so repeat visits cost zero requests;
      // failures still fall back to the packaged snapshot.
      cache: "default",
    });
    if (!response.ok)
      throw new Error(`Sauh request failed: ${response.status}`);
    const payload: unknown = await response.json();
    // Pages/BFF snapshots already contain the normalized contract. The live
    // WordPress endpoint still returns raw posts, so accept both shapes while
    // applying the same URL/schema boundary to each.
    const normalized = parseNormalizedSauh(payload);
    return normalized.length > 0 ? normalized : parseSauhPosts(payload);
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

async function requestToday(url: string): Promise<SauhPost[]> {
  const items = await request(url);
  const today = selectTodaySauh(items);
  if (today.length === 0)
    throw new Error("Sauh source does not contain today's entry");
  return today;
}

async function loadNetworkToday(): Promise<SauhPost[]> {
  const networkCandidates = sauhNetworkCandidates(
    import.meta.env.VITE_BFF_BASE_URL,
  );
  let lastError: unknown;
  for (const url of networkCandidates) {
    try {
      return await requestToday(url);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Sauh Bagi Jiwa is unavailable");
}

export async function fetchSauh(signal?: AbortSignal): Promise<SauhPost[]> {
  const dayKey = localDateKey(new Date());
  if (
    cachedToday &&
    cachedToday.dayKey === dayKey &&
    cachedToday.expiresAt > Date.now()
  )
    return [...cachedToday.items];
  const existing =
    inFlightToday?.dayKey === dayKey ? inFlightToday.promise : undefined;
  if (existing) return [...(await waitFor(existing, signal))];
  const shared = (async () => {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    if (offline) {
      // Offline users should see the pinned snapshot immediately, without
      // spending two network timeouts before the fallback is attempted. A
      // stale but verified snapshot is a deliberate degraded mode; an empty
      // or malformed snapshot still produces the actionable error state.
      const snapshot = await request(STATIC_URL);
      const selected = selectOfflineSauh(snapshot);
      if (selected.length) return selected;
      throw new Error("Sauh snapshot is empty");
    }

    // The local snapshot is a verified, source-backed baseline. Race it with
    // live revalidation so a slow/CORS-blocked WordPress request never leaves
    // Home blank for four seconds. When the snapshot wins, the live result
    // still updates the in-memory cache for the next open.
    const snapshot = request(STATIC_URL).then(
      (items) => {
        const selected = selectOfflineSauh(items);
        return selected.length
          ? { source: "snapshot" as const, items: selected }
          : undefined;
      },
      () => undefined,
    );
    const network = loadNetworkToday().then(
      (items) => ({ source: "network" as const, items }),
      (error: unknown) => {
        recordDiagnostic("warn", "sauh.revalidate", error);
        return undefined;
      },
    );
    const first = await Promise.race([snapshot, network]);
    if (first) {
      if (first.source === "snapshot") {
        void network.then((result) => {
          if (result?.source === "network") {
            cachedToday = {
              dayKey,
              expiresAt: Date.now() + CACHE_TTL_MS,
              items: [...result.items],
            };
            publishSauhUpdate(result.items);
          }
        });
      }
      return first.items;
    }

    const [snapshotResult, networkResult] = await Promise.all([
      snapshot,
      network,
    ]);
    const fallback = networkResult ?? snapshotResult;
    if (fallback) return fallback.items;
    const failure = new Error("Sauh Bagi Jiwa is unavailable");
    recordDiagnostic("error", "sauh.fetch", failure);
    throw failure;
  })();
  const tracked = shared.then(
    (items) => {
      cachedToday = {
        dayKey,
        expiresAt: Date.now() + CACHE_TTL_MS,
        items: [...items],
      };
      return items;
    },
    (error: unknown) => {
      throw error;
    },
  );
  inFlightToday = { dayKey, promise: tracked };
  void tracked.then(
    () => {
      if (inFlightToday?.promise === tracked) inFlightToday = undefined;
    },
    () => {
      if (inFlightToday?.promise === tracked) inFlightToday = undefined;
    },
  );
  return [...(await waitFor(tracked, signal))];
}
