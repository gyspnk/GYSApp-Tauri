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

function requestId(c: {
  req: { header(name: string): string | undefined };
}): string {
  return c.req.header("x-request-id") ?? crypto.randomUUID();
}

type AppContext = Context<{ Bindings: BffBindings }>;

function errorResponse(c: AppContext, code: ErrorCode, message: string) {
  const body = ErrorResponseSchema.parse({
    error: { code, message, requestId: requestId(c) },
  });
  return c.json(body, statusFor[code]);
}

function safeText(value: string): string {
  return value.replace(/<[^>]*>/g, "").trim();
}

export function createApp(config: BffConfig): Hono<{ Bindings: BffBindings }> {
  const manifest = ChordManifestV1Schema.parse(config.chordManifest);
  const content = config.content.map((item) =>
    OnlineContentSchema.parse({
      ...item,
      title: safeText(item.title),
      body: safeText(item.body),
    }),
  );
  const app = new Hono<{ Bindings: BffBindings }>();
  const rateLimit = config.rateLimit ?? { max: 120, windowMs: 60_000 };
  const buckets = new Map<string, { startedAt: number; count: number }>();

  app.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    if (origin && !config.allowedOrigins.includes(origin))
      return errorResponse(c, "FORBIDDEN", "Origin is not allowed");
    const key =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
    const now = Date.now();
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
    c.header("x-request-id", requestId(c));
    c.header("x-content-type-options", "nosniff");
    c.header("referrer-policy", "strict-origin-when-cross-origin");
    c.header("permissions-policy", "camera=(), microphone=(), geolocation=()");
    c.header(
      "content-security-policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    if (origin) {
      c.header("access-control-allow-origin", origin);
      c.header("vary", "Origin");
    }
  });

  app.options("*", (c) => {
    const origin = c.req.header("origin");
    if (origin && !config.allowedOrigins.includes(origin))
      return errorResponse(c, "FORBIDDEN", "Origin is not allowed");
    if (origin) c.header("access-control-allow-origin", origin);
    c.header("access-control-allow-methods", "GET,POST,OPTIONS");
    c.header(
      "access-control-allow-headers",
      "content-type,authorization,x-request-id",
    );
    c.header("access-control-max-age", "600");
    return c.body(null, 204);
  });

  app.get("/api/v1/content/catalog", (c) => {
    c.header("cache-control", "public, max-age=60, stale-while-revalidate=300");
    return c.json({ items: content });
  });

  app.get("/api/v1/content/:kind", (c) => {
    const kind = ContentKindSchema.safeParse(c.req.param("kind"));
    if (!kind.success)
      return errorResponse(c, "VALIDATION_ERROR", "Unknown content kind");
    c.header("cache-control", "public, max-age=60, stale-while-revalidate=300");
    return c.json({ items: content.filter((item) => item.kind === kind.data) });
  });

  app.get("/api/v1/content/sauh", (c) => {
    c.header("cache-control", "public, max-age=60, stale-while-revalidate=300");
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
    if (!c.req.header("authorization") && !c.req.header("cookie"))
      return errorResponse(c, "UNAUTHORIZED", "No active session");
    return c.json({ authenticated: true });
  });

  app.post("/api/v1/auth/logout", (c) => {
    c.header(
      "set-cookie",
      "gys_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
    );
    return c.body(null, 204);
  });

  app.get("/api/v1/account/profile", (c) => {
    if (!c.req.header("authorization") && !c.req.header("cookie"))
      return errorResponse(c, "UNAUTHORIZED", "No active session");
    return c.json({ profile: null });
  });

  app.post("/api/v1/report", async (c) => {
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
