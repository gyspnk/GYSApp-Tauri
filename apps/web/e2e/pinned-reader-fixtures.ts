import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request, type Page } from "@playwright/test";

// Reuse real, immutable assets across browser contexts. UI tests still exercise
// the application's integrity checks and PDF/chord rendering, without repeatedly
// downloading a 4.7 MB book or depending on browser-to-CDN CORS behavior.
const pending = new Map<string, Promise<Buffer>>();
async function pinnedBytes(url: string, sha256: string, size: number) {
  const existing = pending.get(sha256);
  if (existing) return existing;
  const loading = (async () => {
    const cache = join(tmpdir(), "gysapp-pinned-reader-fixtures");
    const file = join(cache, sha256);
    const valid = (bytes: Buffer) =>
      bytes.byteLength === size &&
      createHash("sha256").update(bytes).digest("hex") === sha256;
    try {
      const bytes = await readFile(file);
      if (valid(bytes)) return bytes;
    } catch {
      // A missing cache entry is downloaded once below.
    }
    const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
    const proxy = proxyUrl ? new URL(proxyUrl) : undefined;
    const client = await request.newContext({
      ...(proxy
        ? {
            proxy: {
              server: proxy.origin,
              ...(proxy.username
                ? { username: decodeURIComponent(proxy.username) }
                : {}),
              ...(proxy.password
                ? { password: decodeURIComponent(proxy.password) }
                : {}),
            },
          }
        : {}),
    });
    try {
      const response = await client.get(url, {
        timeout: 30_000,
        maxRetries: 2,
      });
      if (!response.ok())
        throw new Error(`Pinned reader asset HTTP ${response.status()}`);
      const bytes = await response.body();
      if (!valid(bytes))
        throw new Error("Pinned reader fixture integrity mismatch");
      await mkdir(cache, { recursive: true });
      await writeFile(file, bytes);
      return bytes;
    } finally {
      await client.dispose();
    }
  })();
  pending.set(sha256, loading);
  return loading;
}

export async function preparePinnedReaderAssets(page: Page) {
  const lock = JSON.parse(
    await readFile(
      new URL("../public/offline/music-lock.json", import.meta.url),
      "utf8",
    ),
  ) as {
    sourceCommit: string;
    items: Array<{ kind: string; path: string; sha256: string; size: number }>;
  };
  const chord = lock.items.find(
    (item) => item.kind === "chord" && /\/001_/.test(item.path),
  );
  if (!chord)
    throw new Error(
      "Canonical hymn 001 chord fixture is missing from the music lock",
    );
  const manifest = JSON.parse(
    await readFile(
      new URL("../public/offline/fork-hymnal-manifest.json", import.meta.url),
      "utf8",
    ),
  ) as {
    sourceRepo: string;
    sourceCommit: string;
    masterPath: string;
    sha256: string;
    sizeBytes: number;
  };
  const chordUrl = `https://raw.githubusercontent.com/gyspnk/gyschordweb/${lock.sourceCommit}/docs/${chord.path
    .replace(/^docs\//, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const masterUrl = `https://raw.githubusercontent.com/${manifest.sourceRepo}/${manifest.sourceCommit}/${manifest.masterPath}`;
  const [chordBytes, pdfBytes] = await Promise.all([
    pinnedBytes(chordUrl, chord.sha256, chord.size),
    pinnedBytes(masterUrl, manifest.sha256, manifest.sizeBytes),
  ]);
  await page.route(chordUrl, (route) =>
    route.fulfill({ body: chordBytes, contentType: "application/json" }),
  );
  await page.route(masterUrl, (route) =>
    route.fulfill({ body: pdfBytes, contentType: "application/pdf" }),
  );
}
