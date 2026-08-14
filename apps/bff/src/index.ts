import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  ChordManifestV1Schema,
  ErrorResponseSchema,
  OnlineContentSchema,
  type ChordManifestV1,
  type ErrorCode,
  type OnlineContent,
} from "@gys/contracts";
import { z } from "zod";
import { chordManifest as generatedChordManifest } from "./chord-manifest.js";

const ContentKindSchema = z.enum([
  "literature",
  "media",
  "sauh",
  "announcement",
]);
const ProviderSchema = z.enum(["google", "apple", "egys"]);
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
  return value.replace(/<[^>]*>/g, "").trim();
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
      "content-type,authorization,x-request-id",
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

  app.get("/api/v1/content/sauh", (c) => {
    const etag = `${catalogEtag}-sauh`;
    c.header("cache-control", "public, max-age=60, stale-while-revalidate=300");
    c.header("etag", etag);
    if (c.req.header("if-none-match") === etag) return c.body(null, 304);
    return c.json({ items: content.filter((item) => item.kind === "sauh") });
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

  app.post("/api/v1/auth/exchange/:provider", (c) => {
    c.header("cache-control", "no-store");
    const provider = ProviderSchema.safeParse(c.req.param("provider"));
    if (!provider.success)
      return errorResponse(
        c,
        "VALIDATION_ERROR",
        "Unknown authentication provider",
      );
    return errorResponse(
      c,
      "UPSTREAM_UNAVAILABLE",
      `${provider.data} authentication is not configured in this environment`,
    );
  });

  app.get("/api/v1/auth/session", (c) => {
    c.header("cache-control", "no-store");
    if (!c.req.header("authorization") && !c.req.header("cookie"))
      return errorResponse(c, "UNAUTHORIZED", "No active session");
    return c.json({ authenticated: true });
  });

  app.post("/api/v1/auth/logout", (c) => {
    c.header("cache-control", "no-store");
    c.header(
      "set-cookie",
      "gys_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
    );
    return c.body(null, 204);
  });

  app.get("/api/v1/account/profile", (c) => {
    c.header("cache-control", "no-store");
    if (!c.req.header("authorization") && !c.req.header("cookie"))
      return errorResponse(c, "UNAUTHORIZED", "No active session");
    return c.json({ profile: null });
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
