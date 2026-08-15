import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  ChordManifestV1Schema,
  ErrorResponseSchema,
  OnlineContentSchema,
  AccountProfileSchema,
  type ChordManifestV1,
  type ErrorCode,
  type OnlineContent,
  EgysMeResponseSchema,
  EgysProvidersSchema,
  EgysSignInResponseSchema,
  EgysWhatsAppLoginStartedSchema,
  EgysWhatsAppLoginStateSchema,
  EdgeTtsRequestSchema,
  EdgeTtsVoicesResponseSchema,
} from "@gys/contracts";
import { z } from "zod";
import { chordManifest as generatedChordManifest } from "./chord-manifest.js";
import { normalizeSauhPosts, onlyTodaySauh } from "./sauh.js";
import { fetchLiteratureCatalog } from "./literature.js";
import { fetchSuaraSejati } from "./suara.js";
import { fetchArticle, htmlToText } from "./article.js";
import { egysUpstreamCommit } from "./egys-provenance.js";
import { egysOpenApiContract } from "./egys-contract.js";

const ContentKindSchema = z.enum([
  "literature",
  "media",
  "sauh",
  "announcement",
]);
const ProviderSchema = z.enum(["google", "apple"]);
const ReportSchema = z.object({
  category: z.string().min(1).max(80),
  message: z.string().min(1).max(2_000),
  url: z
    .string()
    .url()
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol))
    .optional(),
});
export type BffConfig = {
  allowedOrigins: string[];
  chordManifest: ChordManifestV1;
  content: OnlineContent[];
  rateLimit?: { max: number; windowMs: number };
};

export type BffBindings = {
  ALLOWED_ORIGINS?: string;
  SAUH_SOURCE_URL?: string;
  SUARA_SOURCE_URL?: string;
  EGYS_API_BASE_URL?: string;
  EDGE_TTS_URL?: string;
  EDGE_TTS_VOICES_URL?: string;
  LITERATURE_SOURCE_URL?: string;
  EGYS_UPSTREAM_COMMIT?: string;
};

type BffVariables = {
  requestId: string;
};

const statusFor: Record<ErrorCode, ContentfulStatusCode> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UPSTREAM_UNAVAILABLE: 503,
  INTEGRITY_ERROR: 502,
  OFFLINE: 503,
  INTERNAL_ERROR: 500,
};

type AppContext = Context<{
  Bindings: BffBindings;
  Variables: BffVariables;
}>;

function requestId(c: AppContext): string {
  return (
    c.get("requestId") ?? c.req.header("x-request-id") ?? crypto.randomUUID()
  );
}

function errorResponse(c: AppContext, code: ErrorCode, message: string) {
  const id = requestId(c);
  c.header("x-request-id", id);
  const body = ErrorResponseSchema.parse({
    error: { code, message, requestId: id },
  });
  return c.json(body, statusFor[code]);
}

function safeText(value: string): string {
  return htmlToText(value).replace(/\s+/g, " ").trim();
}

function originList(c: AppContext, fallback: readonly string[]): string[] {
  const configured = c.env?.ALLOWED_ORIGINS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return configured?.length ? configured : [...fallback];
}

function etagForContent(items: readonly OnlineContent[]): string {
  const version = items.map((item) => `${item.id}:${item.updatedAt}`).join("|");
  return `W/"content-${version.length}-${version.slice(0, 48)}"`;
}

function egysBase(c: AppContext): string | undefined {
  const value = c.env?.EGYS_API_BASE_URL?.trim();
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const localDevelopment =
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !localDevelopment) return undefined;
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function allowlistedTjcSource(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (
      url.protocol !== "https:" ||
      !["tjc.org", "www.tjc.org"].includes(url.hostname.toLowerCase())
    )
      return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function egysHeaders(c: AppContext, headers?: HeadersInit): Headers {
  const next = new Headers(headers);
  next.set("accept", "application/json");
  const cookie = c.req.header("cookie");
  const authorization = c.req.header("authorization");
  if (cookie) next.set("cookie", cookie);
  if (authorization) next.set("authorization", authorization);
  next.set("x-request-id", requestId(c));
  return next;
}

function forwardSetCookie(c: AppContext, upstream: Response): void {
  const value = upstream.headers.get("set-cookie");
  if (!value) return;
  c.header(
    "set-cookie",
    value
      .replace(/;\s*Domain=[^;]+/gi, "")
      .replace(/;\s*Path=[^;]*/gi, "; Path=/"),
  );
}

async function requestEgys(
  c: AppContext,
  path: string,
  init: RequestInit = {},
): Promise<Response | undefined> {
  const base = egysBase(c);
  if (!base) return undefined;
  const url = `${base}/api/v1/${path.replace(/^\//, "")}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  const abort = () => controller.abort();
  c.req.raw.signal.addEventListener("abort", abort, { once: true });
  try {
    return await fetch(url, {
      ...init,
      headers: egysHeaders(c, init.headers),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    c.req.raw.signal.removeEventListener("abort", abort);
  }
}

async function proxyEgysJson(
  c: AppContext,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const upstream = await requestEgys(c, path, init);
  if (!upstream)
    return new Response(
      JSON.stringify({
        error: {
          code: "UPSTREAM_UNAVAILABLE",
          message: "e-GYS is not configured for this deployment",
          requestId: requestId(c),
        },
      }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  forwardSetCookie(c, upstream);
  const text = await upstream.text();
  return new Response(text || "{}", {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}

export function createApp(
  config: BffConfig,
): Hono<{ Bindings: BffBindings; Variables: BffVariables }> {
  const manifest = ChordManifestV1Schema.parse(config.chordManifest);
  const content = config.content.map((item) =>
    OnlineContentSchema.parse({
      ...item,
      title: safeText(item.title),
      body: safeText(item.body),
    }),
  );
  const app = new Hono<{
    Bindings: BffBindings;
    Variables: BffVariables;
  }>();
  const rateLimit = config.rateLimit ?? { max: 120, windowMs: 60_000 };
  const buckets = new Map<string, { startedAt: number; count: number }>();
  let lastBucketSweep = 0;
  const catalogEtag = etagForContent(content);
  let literatureCache:
    | {
        catalog: Awaited<ReturnType<typeof fetchLiteratureCatalog>>;
        etag: string;
        expiresAt: number;
      }
    | undefined;
  let literatureInflight:
    | Promise<{
        catalog: Awaited<ReturnType<typeof fetchLiteratureCatalog>>;
        etag: string;
        expiresAt: number;
      }>
    | undefined;
  let suaraCache:
    | {
        items: Awaited<ReturnType<typeof fetchSuaraSejati>>;
        etag: string;
        expiresAt: number;
      }
    | undefined;
  let suaraInflight:
    | Promise<{
        items: Awaited<ReturnType<typeof fetchSuaraSejati>>;
        etag: string;
        expiresAt: number;
      }>
    | undefined;
  const articleCache = new Map<
    string,
    { article: Awaited<ReturnType<typeof fetchArticle>>; expiresAt: number }
  >();
  const articleInflight = new Map<
    string,
    Promise<{
      article: Awaited<ReturnType<typeof fetchArticle>>;
      expiresAt: number;
    }>
  >();

  app.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    const allowedOrigins = originList(c, config.allowedOrigins);
    const id = requestId(c);
    c.set("requestId", id);
    c.header("x-request-id", id);
    c.header("x-content-type-options", "nosniff");
    c.header("referrer-policy", "strict-origin-when-cross-origin");
    c.header("x-frame-options", "DENY");
    c.header(
      "strict-transport-security",
      "max-age=31536000; includeSubDomains",
    );
    c.header("cross-origin-resource-policy", "same-site");
    c.header("permissions-policy", "camera=(), microphone=(), geolocation=()");
    c.header(
      "content-security-policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    if (origin && !allowedOrigins.includes(origin))
      return errorResponse(c, "FORBIDDEN", "Origin is not allowed");
    if (origin) {
      c.header("access-control-allow-origin", origin);
      c.header("access-control-allow-credentials", "true");
      c.header("vary", "Origin");
    }
    const key =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
    const now = Date.now();
    if (now - lastBucketSweep > rateLimit.windowMs) {
      for (const [bucketKey, value] of buckets) {
        if (now - value.startedAt >= rateLimit.windowMs)
          buckets.delete(bucketKey);
      }
      lastBucketSweep = now;
    }
    const current = buckets.get(key);
    const bucket =
      !current || now - current.startedAt >= rateLimit.windowMs
        ? { startedAt: now, count: 0 }
        : current;
    bucket.count += 1;
    buckets.set(key, bucket);
    if (bucket.count > rateLimit.max) {
      c.header(
        "retry-after",
        String(Math.ceil((bucket.startedAt + rateLimit.windowMs - now) / 1000)),
      );
      return errorResponse(c, "RATE_LIMITED", "Too many requests");
    }
    await next();
  });

  app.options("*", (c) => {
    const origin = c.req.header("origin");
    if (origin && !originList(c, config.allowedOrigins).includes(origin))
      return errorResponse(c, "FORBIDDEN", "Origin is not allowed");
    if (origin) {
      c.header("access-control-allow-origin", origin);
      c.header("access-control-allow-credentials", "true");
      c.header("vary", "Origin");
    }
    c.header("access-control-allow-methods", "GET,POST,OPTIONS");
    c.header(
      "access-control-allow-headers",
      "content-type,authorization,x-request-id,range",
    );
    c.header("access-control-max-age", "600");
    return c.body(null, 204);
  });

  app.get("/api/v1/content/catalog", (c) => {
    c.header("etag", catalogEtag);
    c.header("cache-control", "public, max-age=60, stale-while-revalidate=300");
    if (c.req.header("if-none-match") === catalogEtag) return c.body(null, 304);
    return c.json({ items: content });
  });

  app.get("/api/v1/content/literature", async (c) => {
    try {
      const now = Date.now();
      if (!literatureCache || literatureCache.expiresAt <= now) {
        literatureInflight ??= (async () => {
          const catalog = await fetchLiteratureCatalog(
            allowlistedTjcSource(c.env?.LITERATURE_SOURCE_URL),
          );
          const etag = `W/\"literature-${catalog.items.length}-${catalog.items[0]?.updatedAt ?? "empty"}\"`;
          const next = { catalog, etag, expiresAt: Date.now() + 5 * 60_000 };
          literatureCache = next;
          return next;
        })().finally(() => {
          literatureInflight = undefined;
        });
        await literatureInflight;
      }
      const cached = literatureCache;
      if (!cached) throw new Error("Literature cache was not populated");
      const { catalog, etag } = cached;
      c.header("etag", etag);
      c.header(
        "cache-control",
        "public, max-age=300, stale-while-revalidate=3600",
      );
      if (c.req.header("if-none-match") === etag) return c.body(null, 304);
      return c.json(catalog);
    } catch {
      return errorResponse(
        c,
        "UPSTREAM_UNAVAILABLE",
        "Literature source is unavailable",
      );
    }
  });

  app.get("/api/v1/content/sauh", async (c) => {
    let items: unknown[] = content.filter((item) => item.kind === "sauh");
    const sourceUrl = allowlistedTjcSource(c.env?.SAUH_SOURCE_URL);
    if (sourceUrl) {
      try {
        const url = new URL(sourceUrl);
        url.searchParams.set("categories", "229");
        url.searchParams.set("per_page", "6");
        url.searchParams.set("orderby", "date");
        url.searchParams.set("order", "desc");
        url.searchParams.set("_embed", "wp:featuredmedia");
        const upstream = await fetch(url, {
          headers: { accept: "application/json" },
        });
        if (upstream.ok)
          items = onlyTodaySauh(normalizeSauhPosts(await upstream.json()));
      } catch (error) {
        console.warn(
          "Sauh upstream unavailable; using packaged fallback",
          error,
        );
      }
    }
    items = onlyTodaySauh(
      items.filter((item): item is import("@gys/contracts").SauhPost =>
        Boolean(item && typeof item === "object" && "updatedAt" in item),
      ),
    );
    const etag = `${catalogEtag}-sauh-${JSON.stringify(items).length}`;
    c.header("cache-control", "public, max-age=60, stale-while-revalidate=300");
    c.header("etag", etag);
    if (c.req.header("if-none-match") === etag) return c.body(null, 304);
    return c.json({ items });
  });

  app.get("/api/v1/content/pdf", async (c) => {
    const rawUrl = c.req.query("url");
    if (!rawUrl || rawUrl.length > 2_048)
      return errorResponse(c, "VALIDATION_ERROR", "PDF url is required");
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return errorResponse(c, "VALIDATION_ERROR", "PDF url is invalid");
    }
    if (
      url.protocol !== "https:" ||
      url.hostname !== "tjc.org" ||
      !/\.pdf$/i.test(url.pathname)
    )
      return errorResponse(c, "FORBIDDEN", "PDF source is not allowlisted");
    try {
      const range = c.req.header("range");
      const upstream = await fetch(url, {
        headers: {
          accept: "application/pdf",
          ...(range ? { range } : {}),
        },
        signal: c.req.raw.signal,
      });
      if (!upstream.ok && upstream.status !== 206)
        return errorResponse(
          c,
          "UPSTREAM_UNAVAILABLE",
          "PDF source unavailable",
        );
      c.header("content-type", "application/pdf");
      c.header(
        "cache-control",
        "public, max-age=86400, stale-while-revalidate=604800",
      );
      c.header("cross-origin-resource-policy", "cross-origin");
      for (const header of [
        "content-length",
        "content-range",
        "accept-ranges",
        "etag",
      ]) {
        const value = upstream.headers.get(header);
        if (value) c.header(header, value);
      }
      return new Response(upstream.body, {
        status: upstream.status,
        headers: c.res.headers,
      });
    } catch {
      return errorResponse(c, "UPSTREAM_UNAVAILABLE", "PDF source unavailable");
    }
  });

  /**
   * Internal article reader source. The URL is constrained to the official
   * TJC origin, fetched once into a short-lived Worker cache, and normalized to
   * plain text before it ever reaches the browser. The UI keeps the source
   * link as an explicit secondary action, but never redirects the reader.
   */
  app.get("/api/v1/content/article", async (c) => {
    const rawUrl = c.req.query("url");
    if (!rawUrl || rawUrl.length > 2_048)
      return errorResponse(c, "VALIDATION_ERROR", "Article url is required");
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return errorResponse(c, "VALIDATION_ERROR", "Article url is invalid");
    }
    if (
      url.protocol !== "https:" ||
      !["tjc.org", "www.tjc.org"].includes(url.hostname.toLowerCase()) ||
      /\.pdf$/i.test(url.pathname)
    )
      return errorResponse(c, "FORBIDDEN", "Article source is not allowlisted");
    const key = url.toString();
    const now = Date.now();
    let entry = articleCache.get(key);
    if (!entry || entry.expiresAt <= now) {
      const shared = articleInflight.get(key);
      try {
        if (shared) {
          entry = await shared;
        } else {
          // The shared fetch must not inherit one caller's disconnect: another
          // simultaneous reader may still be waiting for the same article.
          const pending = fetchArticle(key).then((article) => {
            const next = { article, expiresAt: Date.now() + 10 * 60_000 };
            if (articleCache.size >= 32) {
              const oldest = articleCache.keys().next().value;
              if (oldest) articleCache.delete(oldest);
            }
            articleCache.set(key, next);
            return next;
          });
          articleInflight.set(key, pending);
          try {
            entry = await pending;
          } finally {
            if (articleInflight.get(key) === pending)
              articleInflight.delete(key);
          }
        }
      } catch {
        return errorResponse(
          c,
          "UPSTREAM_UNAVAILABLE",
          "Article source is unavailable",
        );
      }
    }
    const etag = `W/\"article-${entry.article.id}-${entry.article.fetchedAt}\"`;
    c.header("etag", etag);
    c.header(
      "cache-control",
      "public, max-age=300, stale-while-revalidate=3600",
    );
    if (c.req.header("if-none-match") === etag) return c.body(null, 304);
    return c.json(entry.article);
  });

  /**
   * Same-origin binary proxy for canonical GYSChordWeb assets. Keeping the
   * source commit and path constrained by the generated lock prevents the
   * Worker from becoming an open proxy while making MIDI/chord/PDF fetches
   * reliable on browsers that reject cross-origin range requests.
   */
  app.get("/api/v1/content/music", async (c) => {
    const path = c.req.query("path");
    const commit = c.req.query("commit") ?? manifest.sourceCommit;
    if (!path || path.length > 512)
      return errorResponse(
        c,
        "VALIDATION_ERROR",
        "Music asset path is required",
      );
    if (commit !== manifest.sourceCommit)
      return errorResponse(
        c,
        "FORBIDDEN",
        "Music source commit is not allowlisted",
      );
    const allowlistedPath =
      /^assets\/(?:midi|soundfont|pdf|chord)\/[^/]+\.(?:mid|midi|sf2|pdf|json)$/i.test(
        path,
      ) && !path.includes("..");
    if (!allowlistedPath)
      return errorResponse(c, "FORBIDDEN", "Music asset is not allowlisted");
    const encodedPath = path
      .replace(/^docs\//, "")
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const url = `https://raw.githubusercontent.com/gyspnk/gyschordweb/${encodeURIComponent(commit)}/docs/${encodedPath}`;
    try {
      const range = c.req.header("range");
      const upstream = await fetch(url, {
        headers: {
          accept:
            "application/octet-stream,application/json,application/pdf,*/*",
          ...(range ? { range } : {}),
        },
        signal: c.req.raw.signal,
      });
      if (!upstream.ok && upstream.status !== 206)
        return errorResponse(
          c,
          "UPSTREAM_UNAVAILABLE",
          "Music asset unavailable",
        );
      const isPdf = /\.pdf$/i.test(path);
      const isChord = /\.json$/i.test(path);
      c.header(
        "content-type",
        isPdf
          ? "application/pdf"
          : isChord
            ? "application/json"
            : "application/octet-stream",
      );
      c.header("cache-control", "public, max-age=31536000, immutable");
      c.header("cross-origin-resource-policy", "cross-origin");
      for (const header of [
        "content-length",
        "content-range",
        "accept-ranges",
        "etag",
      ]) {
        const value = upstream.headers.get(header);
        if (value) c.header(header, value);
      }
      return new Response(upstream.body, {
        status: upstream.status,
        headers: c.res.headers,
      });
    } catch {
      return errorResponse(
        c,
        "UPSTREAM_UNAVAILABLE",
        "Music asset unavailable",
      );
    }
  });

  app.get("/api/v1/content/suara-sejati", async (c) => {
    try {
      const now = Date.now();
      if (!suaraCache || suaraCache.expiresAt <= now) {
        suaraInflight ??= (async () => {
          const items = await fetchSuaraSejati(
            allowlistedTjcSource(c.env?.SUARA_SOURCE_URL),
          );
          const etag = `W/\"suara-sejati-${items.length}-${items[0]?.publishedAt ?? "empty"}\"`;
          const next = { items, etag, expiresAt: Date.now() + 5 * 60_000 };
          suaraCache = next;
          return next;
        })().finally(() => {
          suaraInflight = undefined;
        });
        await suaraInflight;
      }
      const cached = suaraCache;
      if (!cached) throw new Error("Suara Sejati cache was not populated");
      const { items, etag } = cached;
      c.header(
        "cache-control",
        "public, max-age=300, stale-while-revalidate=3600",
      );
      c.header("etag", etag);
      if (c.req.header("if-none-match") === etag) return c.body(null, 304);
      return c.json({ items });
    } catch {
      return errorResponse(
        c,
        "UPSTREAM_UNAVAILABLE",
        "Suara Sejati source is unavailable",
      );
    }
  });

  app.get("/api/v1/content/:kind", (c) => {
    const kind = ContentKindSchema.safeParse(c.req.param("kind"));
    if (!kind.success)
      return errorResponse(c, "VALIDATION_ERROR", "Unknown content kind");
    const items = content.filter((item) => item.kind === kind.data);
    const etag = `${catalogEtag}-${kind.data}`;
    c.header("etag", etag);
    c.header("cache-control", "public, max-age=60, stale-while-revalidate=300");
    if (c.req.header("if-none-match") === etag) return c.body(null, 304);
    return c.json({ items });
  });

  app.get("/api/v1/chords/manifest", (c) => {
    const etag = `W/"${manifest.sourceCommit}"`;
    c.header("etag", etag);
    c.header(
      "cache-control",
      "public, max-age=300, stale-while-revalidate=3600",
    );
    if (c.req.header("if-none-match") === etag) return c.body(null, 304);
    return c.json(manifest);
  });

  app.get("/api/v1/tts/edge/voices", async (c) => {
    c.header(
      "cache-control",
      "public, max-age=300, stale-while-revalidate=900",
    );
    const configured = c.env?.EDGE_TTS_VOICES_URL?.trim();
    if (!configured)
      return errorResponse(
        c,
        "UPSTREAM_UNAVAILABLE",
        "Edge speech voice catalog is not configured",
      );
    let endpoint: URL;
    try {
      endpoint = new URL(configured);
    } catch {
      return errorResponse(
        c,
        "INTERNAL_ERROR",
        "Edge speech voice catalog endpoint is invalid",
      );
    }
    if (endpoint.protocol !== "https:")
      return errorResponse(
        c,
        "FORBIDDEN",
        "Edge speech voice catalog endpoint must use HTTPS",
      );
    try {
      const upstream = await fetch(endpoint, {
        headers: { accept: "application/json" },
        signal: c.req.raw.signal,
      });
      if (!upstream.ok)
        return errorResponse(
          c,
          "UPSTREAM_UNAVAILABLE",
          "Edge speech voice catalog is unavailable",
        );
      const body: unknown = await upstream.json().catch(() => undefined);
      const parsed = EdgeTtsVoicesResponseSchema.safeParse(
        Array.isArray(body) ? { voices: body } : body,
      );
      return parsed.success
        ? c.json(parsed.data)
        : errorResponse(
            c,
            "INTEGRITY_ERROR",
            "Edge speech voice catalog is invalid",
          );
    } catch {
      return errorResponse(
        c,
        "UPSTREAM_UNAVAILABLE",
        "Edge speech voice catalog is unavailable",
      );
    }
  });

  app.post("/api/v1/tts/edge", async (c) => {
    c.header("cache-control", "no-store");
    const configured = c.env?.EDGE_TTS_URL?.trim();
    if (!configured)
      return errorResponse(
        c,
        "UPSTREAM_UNAVAILABLE",
        "Edge compatibility speech is not configured",
      );
    let endpoint: URL;
    try {
      endpoint = new URL(configured);
    } catch {
      return errorResponse(
        c,
        "INTERNAL_ERROR",
        "Edge speech endpoint is invalid",
      );
    }
    if (endpoint.protocol !== "https:")
      return errorResponse(
        c,
        "FORBIDDEN",
        "Edge speech endpoint must use HTTPS",
      );
    const parsed = EdgeTtsRequestSchema.safeParse(
      await c.req.json().catch(() => undefined),
    );
    if (!parsed.success)
      return errorResponse(
        c,
        "VALIDATION_ERROR",
        "Edge speech request is invalid",
      );
    try {
      const upstream = await fetch(endpoint, {
        method: "POST",
        headers: {
          accept: "audio/mpeg",
          "content-type": "application/json",
        },
        body: JSON.stringify(parsed.data),
        signal: c.req.raw.signal,
      });
      if (!upstream.ok)
        return errorResponse(
          c,
          "UPSTREAM_UNAVAILABLE",
          "Edge speech is unavailable",
        );
      const contentType = upstream.headers.get("content-type") ?? "";
      if (!contentType.startsWith("audio/"))
        return errorResponse(
          c,
          "INTEGRITY_ERROR",
          "Edge speech returned invalid media",
        );
      const contentLength = Number(upstream.headers.get("content-length") ?? 0);
      if (contentLength > 10 * 1024 * 1024)
        return errorResponse(
          c,
          "INTEGRITY_ERROR",
          "Edge speech media is too large",
        );
      c.header("content-type", contentType);
      if (contentLength > 0) c.header("content-length", String(contentLength));
      return new Response(upstream.body, {
        status: 200,
        headers: c.res.headers,
      });
    } catch {
      return errorResponse(
        c,
        "UPSTREAM_UNAVAILABLE",
        "Edge speech is unavailable",
      );
    }
  });

  app.get("/api/v1/auth/providers", async (c) => {
    c.header("cache-control", "public, max-age=300");
    if (!egysBase(c)) return c.json({ providers: [] });
    const upstream = await proxyEgysJson(c, "auth/providers");
    if (!upstream.ok)
      return errorResponse(
        c,
        "UPSTREAM_UNAVAILABLE",
        "e-GYS providers unavailable",
      );
    const parsed = EgysProvidersSchema.safeParse(
      await upstream.json().catch(() => undefined),
    );
    return parsed.success
      ? c.json(parsed.data)
      : errorResponse(
          c,
          "INTEGRITY_ERROR",
          "e-GYS provider response is invalid",
        );
  });

  app.post("/api/v1/auth/whatsapp/start", async (c) => {
    c.header("cache-control", "no-store");
    const upstream = await proxyEgysJson(c, "auth/whatsapp/start", {
      method: "POST",
    });
    if (!upstream.ok)
      return errorResponse(
        c,
        "UPSTREAM_UNAVAILABLE",
        "e-GYS WhatsApp sign-in is unavailable",
      );
    const parsed = EgysWhatsAppLoginStartedSchema.safeParse(
      await upstream.json().catch(() => undefined),
    );
    return parsed.success
      ? c.json(parsed.data)
      : errorResponse(
          c,
          "INTEGRITY_ERROR",
          "e-GYS WhatsApp response is invalid",
        );
  });

  app.get("/api/v1/auth/whatsapp/state", async (c) => {
    c.header("cache-control", "no-store");
    const token = c.req.query("token");
    if (!token || token.length > 512)
      return errorResponse(c, "VALIDATION_ERROR", "poll token is required");
    const upstream = await proxyEgysJson(
      c,
      `auth/whatsapp/state?token=${encodeURIComponent(token)}`,
    );
    if (!upstream.ok)
      return errorResponse(
        c,
        "UPSTREAM_UNAVAILABLE",
        "e-GYS WhatsApp state is unavailable",
      );
    const parsed = EgysWhatsAppLoginStateSchema.safeParse(
      await upstream.json().catch(() => undefined),
    );
    return parsed.success
      ? c.json(parsed.data)
      : errorResponse(c, "INTEGRITY_ERROR", "e-GYS WhatsApp state is invalid");
  });

  app.post("/api/v1/auth/exchange/:provider", async (c) => {
    c.header("cache-control", "no-store");
    const provider = ProviderSchema.safeParse(c.req.param("provider"));
    if (!provider.success)
      return errorResponse(
        c,
        "VALIDATION_ERROR",
        "Unknown authentication provider",
      );
    const parsed = z
      .object({ idToken: z.string().min(1).max(20_000) })
      .safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success)
      return errorResponse(c, "VALIDATION_ERROR", "idToken is required");
    const upstream = await requestEgys(c, `auth/${provider.data}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: parsed.data.idToken }),
    });
    if (!upstream)
      return errorResponse(
        c,
        "UPSTREAM_UNAVAILABLE",
        `${provider.data} authentication is not configured in this environment`,
      );
    forwardSetCookie(c, upstream);
    // e-GYS authenticates with an HttpOnly cookie. Never echo an upstream
    // access token or provider payload to the browser.
    if (!upstream.ok)
      return errorResponse(c, "UNAUTHORIZED", "e-GYS authentication failed");
    const body = EgysSignInResponseSchema.safeParse(
      await upstream.json().catch(() => undefined),
    );
    if (!body.success)
      return errorResponse(
        c,
        "INTEGRITY_ERROR",
        "e-GYS authentication response is invalid",
      );
    return c.json({
      authenticated: true,
      expiresAt: body.data.expiresAt,
    });
  });

  app.get("/api/v1/auth/session", async (c) => {
    c.header("cache-control", "no-store");
    if (!c.req.header("authorization") && !c.req.header("cookie"))
      return errorResponse(c, "UNAUTHORIZED", "No active session");
    if (egysBase(c)) {
      const upstream = await proxyEgysJson(c, "auth/me");
      if (!upstream.ok)
        return errorResponse(c, "UNAUTHORIZED", "No active e-GYS session");
    }
    return c.json({ authenticated: true });
  });

  app.post("/api/v1/auth/logout", async (c) => {
    c.header("cache-control", "no-store");
    if (egysBase(c)) await proxyEgysJson(c, "auth/signout", { method: "POST" });
    c.header(
      "set-cookie",
      "egys_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
    );
    return c.body(null, 204);
  });

  app.get("/api/v1/account/profile", async (c) => {
    c.header("cache-control", "no-store");
    if (!c.req.header("authorization") && !c.req.header("cookie"))
      return errorResponse(c, "UNAUTHORIZED", "No active session");
    if (!egysBase(c)) return c.json({ profile: null });
    const upstream = await proxyEgysJson(c, "auth/me");
    if (!upstream.ok)
      return errorResponse(c, "UNAUTHORIZED", "No active session");
    const parsedIdentity = EgysMeResponseSchema.safeParse(
      await upstream.json().catch(() => undefined),
    );
    if (!parsedIdentity.success)
      return errorResponse(
        c,
        "INTEGRITY_ERROR",
        "e-GYS session response is invalid",
      );
    const raw = parsedIdentity.data;
    let member:
      | {
          fullName?: unknown;
          membershipNo?: unknown;
          history?: Array<{
            branchCode?: unknown;
            branchName?: unknown;
            memberStatus?: unknown;
            status?: unknown;
            current?: unknown;
          }>;
        }
      | undefined;
    if (raw.personId) {
      try {
        const memberResponse = await requestEgys(
          c,
          `members/${encodeURIComponent(raw.personId)}`,
        );
        if (memberResponse?.ok) {
          const candidate: unknown = await memberResponse
            .json()
            .catch(() => undefined);
          if (
            candidate &&
            typeof candidate === "object" &&
            "history" in candidate
          )
            member = candidate as typeof member;
        }
      } catch {
        // Identity remains useful even when member detail is outside this account's scope.
      }
    }
    const currentMembership =
      member?.history?.find((entry) => entry.current) ?? member?.history?.[0];
    const memberStatus =
      typeof currentMembership?.memberStatus === "string"
        ? currentMembership.memberStatus
        : typeof currentMembership?.status === "string"
          ? currentMembership.status
          : undefined;
    const branchName =
      typeof currentMembership?.branchName === "string"
        ? currentMembership.branchName
        : typeof raw.branchScope === "string"
          ? raw.branchScope
          : undefined;
    const profile = AccountProfileSchema.parse({
      id: raw.accountId,
      personId: raw.personId,
      displayName: raw.fullName ?? "e-GYS",
      ...(raw.email ? { email: raw.email } : {}),
      ...(typeof currentMembership?.branchCode === "string"
        ? { branchCode: currentMembership.branchCode }
        : raw.homeBranchId
          ? { branchCode: raw.homeBranchId }
          : {}),
      ...(branchName ? { branchName } : {}),
      ...(typeof member?.membershipNo === "string"
        ? { membershipNo: member.membershipNo }
        : {}),
      ...(memberStatus
        ? { memberStatus, isMember: true }
        : member
          ? { isMember: true }
          : {}),
      ...(raw.can
        ? {
            permissions: {
              ...(typeof raw.can.viewMembers === "boolean"
                ? { viewMembers: raw.can.viewMembers }
                : {}),
              ...(typeof raw.can.createMembers === "boolean"
                ? { createMembers: raw.can.createMembers }
                : {}),
              ...(typeof raw.can.updateMembers === "boolean"
                ? { updateMembers: raw.can.updateMembers }
                : {}),
              ...(typeof raw.can.deleteMembers === "boolean"
                ? { deleteMembers: raw.can.deleteMembers }
                : {}),
            },
          }
        : {}),
      provider: "egys",
      locale: raw.language === "en" ? "en" : "id",
    });
    return c.json({ profile });
  });

  app.post("/api/v1/report", async (c) => {
    c.header("cache-control", "no-store");
    const contentLength = Number(c.req.header("content-length") ?? 0);
    if (contentLength > 64_000)
      return errorResponse(
        c,
        "VALIDATION_ERROR",
        "Report payload is too large",
      );
    const parsed = ReportSchema.safeParse(
      await c.req.json().catch(() => undefined),
    );
    if (!parsed.success)
      return errorResponse(c, "VALIDATION_ERROR", "Report payload is invalid");
    return c.json(
      {
        accepted: true,
        report: { ...parsed.data, message: safeText(parsed.data.message) },
      },
      202,
    );
  });

  app.get("/api/v1/meta/egys", (c) =>
    c.json({
      sourceRepo: "Gereja-Yesus-Sejati/egys",
      sourceCommit: c.env?.EGYS_UPSTREAM_COMMIT?.trim() || egysUpstreamCommit,
      openApi: egysOpenApiContract,
    }),
  );

  app.notFound((c) => errorResponse(c, "NOT_FOUND", "Route not found"));
  app.onError((error, c) => {
    console.error(error);
    return errorResponse(c, "INTERNAL_ERROR", "Unexpected server error");
  });
  return app;
}

export const app = createApp({
  allowedOrigins: ["https://gyspnk.github.io", "http://localhost:5173"],
  chordManifest: generatedChordManifest,
  content: [],
});

export default app;
