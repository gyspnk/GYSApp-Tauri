// Refresh the packaged Sauh snapshot at build time.
//
// The home hero can paint from `offline/sauh.json` before the live request
// answers, but only when the snapshot carries *today's* entry (the reader
// filter is strict on purpose: a stale reading must never be shown as today's
// reflection). A committed snapshot goes stale the day after it is written, so
// the hosted build refreshes it from the BFF right before Vite copies `public/`.
//
// The script never fails the build: on any problem it keeps the committed file
// and prints why, because a stale-but-valid snapshot is still better than a
// broken deploy.

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const OFFLINE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "offline",
);
// Two manifests hash the shelf: the pack descriptor and the distributed-asset
// catalogue the app uses for cache invalidation.
const MANIFESTS = ["pack-manifest.json", "asset-manifest.json"].map((name) =>
  path.join(OFFLINE_DIR, name),
);
const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "offline",
  "sauh.json",
);
const TIMEOUT_MS = 15_000;

export function sourceUrl(base, fallback = "https://tjc.org/") {
  const trimmed = (base ?? "").trim().replace(/\/$/, "");
  if (!trimmed) return undefined;
  return `${trimmed}/api/v1/content/sauh`;
}

/** Returns the normalised snapshot body, or undefined when the payload is not a
 * usable shelf. Only fields the app reads are validated. */
export function normaliseSnapshot(payload) {
  const items =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload.items
      : payload;
  if (!Array.isArray(items) || items.length === 0) return undefined;
  const clean = [];
  for (const item of items.slice(0, 20)) {
    if (!item || typeof item !== "object") return undefined;
    const { id, title, verse, body, url, updatedAt, reference, imageUrl } =
      item;
    if (typeof id !== "string" || !id.trim()) return undefined;
    if (typeof title !== "string" || !title.trim()) return undefined;
    if (typeof verse !== "string" || typeof body !== "string") return undefined;
    if (typeof url !== "string" || !/^https:\/\//.test(url)) return undefined;
    if (typeof updatedAt !== "string" || Number.isNaN(Date.parse(updatedAt)))
      return undefined;
    clean.push({
      ...item,
      id,
      title,
      verse,
      body,
      url,
      updatedAt,
      ...(typeof reference === "string" ? { reference } : {}),
      ...(typeof imageUrl === "string" ? { imageUrl } : {}),
    });
  }
  return { items: clean };
}

async function refreshManifestEntry(bytes, digest) {
  // Both manifests are hash-verified by `verify:generated`, so a rewritten
  // shelf must carry its new size and digest in the same step.
  for (const manifestPath of MANIFESTS) {
    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch {
      continue;
    }
    const entry = Array.isArray(manifest.items)
      ? manifest.items.find((item) => item.path === "offline/sauh.json")
      : undefined;
    if (!entry) continue;
    entry.bytes = bytes;
    entry.sha256 = digest;
    // Local asset entries must carry the digest as their version as well.
    if ("version" in entry) entry.version = digest;
    if ("lastUpdated" in entry) entry.lastUpdated = new Date().toISOString();
    await writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
  }
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function readExisting() {
  try {
    await readFile(OUT, "utf8");
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const url = sourceUrl(process.env.VITE_BFF_BASE_URL);
  if (!url) {
    console.log(
      "sauh snapshot: VITE_BFF_BASE_URL is unset, keeping committed file",
    );
    return;
  }
  if (!(await readExisting())) {
    console.log(`sauh snapshot: ${OUT} is missing, nothing to refresh`);
    return;
  }
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.log(
        `sauh snapshot: ${url} answered ${response.status}, keeping committed file`,
      );
      return;
    }
    const snapshot = normaliseSnapshot(await response.json());
    if (!snapshot) {
      console.log(
        "sauh snapshot: payload was not a usable shelf, keeping committed file",
      );
      return;
    }
    const newest = Math.max(
      ...snapshot.items.map((item) => Date.parse(item.updatedAt)),
    );
    // `fetchedAt` is what lets the app paint this shelf before the live
    // request answers: within a day the build already confirmed it upstream.
    const payload = { ...snapshot, fetchedAt: new Date().toISOString() };
    const body = `${JSON.stringify(payload, null, 2)}\n`;
    await writeFile(OUT, body, "utf8");
    await refreshManifestEntry(Buffer.byteLength(body), sha256(body));
    console.log(
      `sauh snapshot: wrote ${snapshot.items.length} item(s), newest ${new Date(newest).toISOString()}`,
    );
  } catch (error) {
    console.log(
      `sauh snapshot: ${(error && error.message) || error}, keeping committed file`,
    );
  }
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main();
}
