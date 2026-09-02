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

export function cleanSauhHtml(rawHtml: string): string {
  let cleaned = rawHtml.replace(
    /<(script|style|iframe|object|embed|template|svg|audio|form)[^>]*>[\s\S]*?<\/\1>/gi,
    " ",
  );

  // Cut off bottom modules: Previous slider, Bible reading accordion, newsletter form, donation
  const cutoffRegexes = [
    /<(?:div|h[1-6]|span|section)[^>]*class="[^"]*(?:module-fancy-heading|tb_zlsh85)[^"]*"[^>]*>[\s\S]*?Sauh Bagi Jiwa Sebelumnya/i,
    /Sauh Bagi Jiwa Sebelumnya/i,
    /<(?:div|section)[^>]*id=["'](?:GBA|Ayat)["']/i,
    /<ul[^>]*class="[^"]*module-accordion[^"]*"[^>]*>/i,
    /Apakah Anda sudah membaca Alkitab/i,
    /Terima kasih atas dukungan dari Saudara\/i/i,
    /Bank Central Asia/i,
  ];

  let earliestCutoff = cleaned.length;
  for (const regex of cutoffRegexes) {
    const match = cleaned.match(regex);
    if (match && match.index !== undefined && match.index < earliestCutoff) {
      earliestCutoff = match.index;
    }
  }
  cleaned = cleaned.slice(0, earliestCutoff);

  // Remove top audio embeds and boilerplate
  cleaned = cleaned.replace(
    /<div[^>]*class="[^"]*module-audio[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    " ",
  );
  cleaned = cleaned.replace(/\[audio[^\]]*\]/gi, " ");
  cleaned = cleaned.replace(
    /https?:\/\/[^\s<"']+\.(?:mp3|wav|ogg|m4a)[^\s<"']*/gi,
    " ",
  );
  cleaned = cleaned.replace(
    /<a[^>]*class="[^"]*su-button[^"]*"[^>]*>[\s\S]*?<\/a>/gi,
    " ",
  );
  cleaned = cleaned.replace(
    /<div[^>]*class="[^"]*shortcode[^"]*box[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    " ",
  );
  cleaned = cleaned.replace(
    /<p[^>]*>\s*<strong>\s*Renungan Tanggal:[\s\S]*?<\/p>/gi,
    " ",
  );
  cleaned = cleaned.replace(
    /<h[1-6][^>]*>[\s\S]*?Bacaan Alkitab Harian[\s\S]*?<\/h[1-6]>/gi,
    " ",
  );
  cleaned = cleaned.replace(
    /<h[1-6][^>]*>[\s\S]*?SAUH BAGI JIWA[\s\S]*?<\/h[1-6]>/gi,
    " ",
  );
  cleaned = cleaned.replace(
    /<a[^>]*class="[^"]*builder_button[^"]*"[^>]*>[\s\S]*?Gerakan Baca Alkitab[\s\S]*?<\/a>/gi,
    " ",
  );

  // Clean dropcaps without inserting spaces between first letter and word
  cleaned = cleaned.replace(
    /<span[^>]*class="[^"]*su-dropcap[^"]*"[^>]*>([A-Za-z0-9])<\/span>/gi,
    "$1",
  );

  return cleaned;
}

export function extractSauhBody(value: string): string {
  const cleaned = cleanSauhHtml(value);
  return decodeEntities(
    cleaned
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(
        /<\/p>|<\/h[1-6]>|<\/li>|<\/div>|<\/section>|<\/article>/gi,
        "\n",
      )
      .replace(/<\/?(?:span|strong|b|em|i|u|a|small|font)[^>]*>/gi, "")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
  const text = extractSauhBody(value) || stripHtml(value);
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

/** The publisher mirrors featured images on an official S3 bucket. */
const TJC_IMAGE_HOSTS = [
  "tjc.org",
  "www.tjc.org",
  "tjcorguploads.s3.amazonaws.com",
];

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

function isTjcImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      TJC_IMAGE_HOSTS.includes(url.hostname.toLowerCase())
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
    const body = extractSauhBody(rawBody).slice(0, 20_000);
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
      ...(isTjcImageUrl(embeddedImage) ? { imageUrl: embeddedImage } : {}),
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
  const base = (bffBase ?? import.meta.env.VITE_BFF_BASE_URL)?.trim();
  const isCrossPortLocalhost =
    typeof window !== "undefined" &&
    Boolean(
      base &&
      (base.includes("127.0.0.1") || base.includes("localhost")) &&
      !base.includes(`:${window.location.port}`),
    );
  const proxy = isCrossPortLocalhost
    ? undefined
    : `${(base ?? "").replace(/\/$/, "")}/api/v1/content/sauh`;
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
 * A packaged snapshot can lag the publisher by days between deploys. Serving
 * an arbitrary old reflection as “today” misleads readers (the Aug snapshot
 * ships a different series entry), so the home surface now renders an
 * explicit loading/error state instead of ever reusing stale content.
 */
export function verifiedTodaySnapshot(
  posts: SauhPost[],
  now = new Date(),
): SauhPost[] {
  return selectTodaySauh(posts, now);
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
    if (result.data.imageUrl && !isTjcImageUrl(result.data.imageUrl)) continue;
    parsed.push(result.data);
  }
  return parsed.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

async function request(url: string, signal?: AbortSignal): Promise<SauhPost[]> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 3_000);
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
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("text/html"))
      throw new Error(`Expected JSON from ${url}, got HTML`);
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

const STORAGE_KEY_PREFIX = "gys_sauh_day_";

/** localStorage survives tab/session restarts; sessionStorage keeps legacy keys readable. */
function sauhStorageAreas(): Storage[] {
  if (typeof window === "undefined") return [];
  const areas: Storage[] = [];
  try {
    if (window.localStorage) areas.push(window.localStorage);
  } catch {
    // storage can be unavailable in private modes
  }
  try {
    if (window.sessionStorage) areas.push(window.sessionStorage);
  } catch {
    // ignore
  }
  return areas;
}

function loadStoredSauh(dayKey: string): SauhPost[] | undefined {
  for (const area of sauhStorageAreas()) {
    try {
      const raw = area.getItem(`${STORAGE_KEY_PREFIX}${dayKey}`);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      const validated = parseNormalizedSauh(parsed);
      // Cached values are only reusable when they still contain today's
      // verified entry; a stale payload must trigger a live fetch instead of
      // being painted as today's reflection.
      const todays = selectTodaySauh(validated);
      if (todays.length) return todays;
    } catch {
      // corrupt entry: ignore and keep probing other areas
    }
  }
  return undefined;
}

function storeSauh(dayKey: string, items: SauhPost[]) {
  const [primary] = sauhStorageAreas();
  if (!primary) return;
  try {
    primary.setItem(`${STORAGE_KEY_PREFIX}${dayKey}`, JSON.stringify(items));
  } catch {
    // ignore storage quota errors
  }
}

export function isTodaySauhAvailable(
  items: SauhPost[],
  now = new Date(),
): boolean {
  return selectTodaySauh(items, now).length > 0;
}

export function getCachedSauh(): SauhPost[] | undefined {
  const dayKey = localDateKey(new Date());
  if (
    cachedToday &&
    cachedToday.dayKey === dayKey &&
    cachedToday.items.length
  ) {
    return [...cachedToday.items];
  }
  const stored = loadStoredSauh(dayKey);
  if (stored && stored.length) {
    cachedToday = {
      dayKey,
      expiresAt: Date.now() + CACHE_TTL_MS,
      items: [...stored],
    };
    return [...stored];
  }
  return undefined;
}

export async function fetchSauh(
  signal?: AbortSignal,
  forceNetwork = false,
): Promise<SauhPost[]> {
  const dayKey = localDateKey(new Date());
  if (!forceNetwork) {
    if (
      cachedToday &&
      cachedToday.dayKey === dayKey &&
      cachedToday.expiresAt > Date.now()
    )
      return [...cachedToday.items];
    const stored = loadStoredSauh(dayKey);
    if (stored && stored.length) {
      cachedToday = {
        dayKey,
        expiresAt: Date.now() + CACHE_TTL_MS,
        items: [...stored],
      };
      return [...stored];
    }
  }
  const existing =
    !forceNetwork && inFlightToday?.dayKey === dayKey
      ? inFlightToday.promise
      : undefined;
  if (existing) return [...(await waitFor(existing, signal))];
  const shared = (async () => {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    if (offline) {
      const snapshot = await request(STATIC_URL);
      const selected = verifiedTodaySnapshot(snapshot);
      if (selected.length) {
        storeSauh(dayKey, selected);
        return selected;
      }
      throw new Error("Renungan hari ini belum tersedia di perangkat ini");
    }

    if (forceNetwork) {
      try {
        const networkItems = await loadNetworkToday();
        if (networkItems.length) {
          cachedToday = {
            dayKey,
            expiresAt: Date.now() + CACHE_TTL_MS,
            items: [...networkItems],
          };
          storeSauh(dayKey, networkItems);
          publishSauhUpdate(networkItems);
          return networkItems;
        }
      } catch (error) {
        recordDiagnostic("warn", "sauh.forceNetwork", error);
      }
    }

    // A packaged snapshot is only an instant paint candidate when the deploy
    // was fresh enough to embed today's own entry; otherwise resolving it
    // to `undefined` hands control straight to the live network result so
    // stale content can never be painted as today's reflection.
    const snapshot = request(STATIC_URL).then(
      (items) => {
        const selected = verifiedTodaySnapshot(items);
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
        storeSauh(dayKey, first.items);
        void network.then((result) => {
          if (result?.source === "network") {
            cachedToday = {
              dayKey,
              expiresAt: Date.now() + CACHE_TTL_MS,
              items: [...result.items],
            };
            storeSauh(dayKey, result.items);
            publishSauhUpdate(result.items);
          }
        });
      } else if (first.source === "network") {
        storeSauh(dayKey, first.items);
      }
      return first.items;
    }

    const [snapshotResult, networkResult] = await Promise.all([
      snapshot,
      network,
    ]);
    const fallback = networkResult ?? snapshotResult;
    if (fallback) {
      storeSauh(dayKey, fallback.items);
      return fallback.items;
    }
    const failure = new Error(
      "Sauh Bagi Jiwa untuk hari ini belum dapat diambil dari sumber resmi.",
    );
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
      storeSauh(dayKey, items);
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
