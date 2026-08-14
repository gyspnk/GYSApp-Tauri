import { describe, expect, it } from "vitest";
import { createApp } from "./index.js";

const manifest = {
  version: 1 as const,
  sourceRepo: "gyspnk/gyschordweb",
  sourceCommit: "cbc7d386",
  generatedAt: "2026-08-14T00:00:00.000Z",
  entries: [],
};

describe("BFF public boundary", () => {
  it("rejects an origin outside the allowlist", async () => {
    const app = createApp({
      allowedOrigins: ["https://good.example"],
      chordManifest: manifest,
      content: [],
    });
    const response = await app.request("/api/v1/content/catalog", {
      headers: { Origin: "https://evil.example" },
    });
    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe("FORBIDDEN");
  });

  it("serves catalog content with an allowed origin and cache headers", async () => {
    const app = createApp({
      allowedOrigins: ["https://good.example"],
      chordManifest: manifest,
      content: [
        {
          id: "a1",
          kind: "announcement",
          title: "<b>Welcome</b>",
          body: "<script>bad</script>Hello",
          updatedAt: "2026-08-14T00:00:00.000Z",
        },
      ],
    });
    const response = await app.request("/api/v1/content/catalog", {
      headers: { Origin: "https://good.example" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://good.example",
    );
    expect(response.headers.get("cache-control")).toContain("max-age=60");
    const payload = (await response.json()) as { items: unknown[] };
    expect(payload.items).toHaveLength(1);
    expect(JSON.stringify(payload.items)).not.toContain("<script>");
  });

  it("returns a typed validation error for an unknown content kind", async () => {
    const app = createApp({
      allowedOrigins: ["http://localhost:5173"],
      chordManifest: manifest,
      content: [],
    });
    const response = await app.request("/api/v1/content/unknown", {
      headers: { Origin: "http://localhost:5173" },
    });
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns the immutable chord manifest with an ETag", async () => {
    const app = createApp({
      allowedOrigins: ["http://localhost:5173"],
      chordManifest: manifest,
      content: [],
    });
    const response = await app.request("/api/v1/chords/manifest", {
      headers: { Origin: "http://localhost:5173" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toContain("cbc7d386");
    const payload = (await response.json()) as { sourceCommit: string };
    expect(payload.sourceCommit).toBe("cbc7d386");
  });

  it("applies a configurable per-client rate limit", async () => {
    const app = createApp({
      allowedOrigins: ["http://localhost:5173"],
      chordManifest: manifest,
      content: [],
      rateLimit: { max: 1, windowMs: 60_000 },
    });
    const init = {
      headers: {
        Origin: "http://localhost:5173",
        "x-forwarded-for": "127.0.0.9",
      },
    };
    expect((await app.request("/api/v1/content/catalog", init)).status).toBe(
      200,
    );
    const response = await app.request("/api/v1/content/catalog", init);
    expect(response.status).toBe(429);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe("RATE_LIMITED");
  });

  it("rejects non-http report URLs and accepts sanitized text", async () => {
    const app = createApp({
      allowedOrigins: ["http://localhost:5173"],
      chordManifest: manifest,
      content: [],
    });
    const invalid = await app.request("/api/v1/report", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        category: "web",
        message: "<b>Issue</b>",
        url: "javascript:alert(1)",
      }),
    });
    expect(invalid.status).toBe(400);
    const valid = await app.request("/api/v1/report", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        category: "web",
        message: "<b>Issue</b>",
        url: "https://example.com/page",
      }),
    });
    expect(valid.status).toBe(202);
    expect(JSON.stringify(await valid.json())).not.toContain("<b>");
  });
});
