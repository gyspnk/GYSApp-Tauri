import {
  HymnalPdfManifestSchema,
  type HymnalPdfManifest,
} from "@gys/contracts";

const RELEASE_MANIFEST =
  "https://raw.githubusercontent.com/ThenGB/GYSApp-Data/main/latest/hymnals-manifest.json";
const FALLBACK_MANIFEST = `${import.meta.env.BASE_URL}offline/fork-hymnal-manifest.json`;
const BFF_BASE = import.meta.env.VITE_BFF_BASE_URL?.trim();
const PACKAGE_CACHE = "gys-fork-pdf-v1";
const KEY_BYTES = Uint8Array.from(
  atob("yrvxIa8zgtn6cxTLH/+BsLjx5SrgGRQN7IVhK0ufB1Y="),
  (value) => value.charCodeAt(0),
);
let mapping: Promise<HymnalPdfManifest> | undefined;
const packageRequests = new Map<string, Promise<Uint8Array>>();

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function loadMapping() {
  mapping ??= fetch(FALLBACK_MANIFEST, { cache: "force-cache" }).then(
    async (response) => {
      if (!response.ok) throw new Error("fork PDF mapping unavailable");
      return HymnalPdfManifestSchema.parse(await response.json());
    },
  );
  return mapping;
}

async function decodePackage(bytes: Uint8Array) {
  const magic = new TextDecoder().decode(bytes.slice(0, 7));
  if (magic !== "GYSPKG1") return bytes;
  // The Flutter `encrypt` package defaults to AESMode.sic (CTR), not CBC.
  // Keep the exact GYSApp-Fork package semantics so the KR master PDF can be
  // reused without shipping a second copy of every song PDF.
  const key = await crypto.subtle.importKey(
    "raw",
    KEY_BYTES,
    { name: "AES-CTR" },
    false,
    ["decrypt"],
  );
  const decrypted = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-CTR", counter: bytes.slice(7, 23), length: 128 },
      key,
      bytes.slice(23),
    ),
  );
  // `encrypt` wraps AES/SIC in PKCS7 padding by default.  SIC is a stream
  // mode, so the padding bytes are still present after WebCrypto decrypt and
  // must be removed before feeding the payload to the gzip decoder.
  const padding = decrypted.at(-1) ?? 0;
  if (padding > 0 && padding <= 16) {
    const start = decrypted.length - padding;
    if (decrypted.slice(start).every((value) => value === padding)) {
      return decompressGzip(decrypted.slice(0, start));
    }
  }
  return decompressGzip(decrypted);
}

async function decompressGzip(decrypted: Uint8Array) {
  if (!("DecompressionStream" in globalThis))
    throw new Error("GYSPKG decompression unavailable");
  const stream = new Blob([decrypted.buffer as ArrayBuffer])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function looksLikePdf(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
}

type PdfIntegrity = {
  sizeBytes?: number;
  sha256?: string;
};

async function validatePdfBytes(
  bytes: Uint8Array,
  expected: PdfIntegrity = {},
): Promise<boolean> {
  if (!looksLikePdf(bytes)) return false;
  if (
    expected.sizeBytes !== undefined &&
    bytes.byteLength !== expected.sizeBytes
  )
    return false;
  if (
    expected.sha256 &&
    (await sha256(bytes)).toLowerCase() !== expected.sha256.toLowerCase()
  )
    return false;
  return true;
}

async function readCached(
  url: string,
  validate: (bytes: Uint8Array) => boolean = () => true,
) {
  if (typeof caches === "undefined") return undefined;
  const cached = await caches
    .open(PACKAGE_CACHE)
    .then((cache) => cache.match(url));
  if (!cached) return undefined;
  const bytes = new Uint8Array(await cached.arrayBuffer());
  return validate(bytes) ? bytes : undefined;
}

async function fetchPdf(url: string, expected: PdfIntegrity = {}) {
  const cached = await readCached(url, looksLikePdf);
  if (cached && (await validatePdfBytes(cached, expected))) return cached;
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok)
    throw new Error(`KR PDF request failed: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!(await validatePdfBytes(bytes, expected)))
    throw new Error("KR PDF integrity validation failed");
  if (typeof caches !== "undefined")
    await caches.open(PACKAGE_CACHE).then((cache) =>
      cache.put(
        url,
        new Response(bytes.slice().buffer as ArrayBuffer, {
          headers: { "content-type": "application/pdf" },
        }),
      ),
    );
  return bytes;
}

async function loadDataPackage() {
  const releaseResponse = await fetch(RELEASE_MANIFEST, {
    cache: "no-cache",
  });
  if (!releaseResponse.ok)
    throw new Error("GYSApp-Data PDF release unavailable");
  const release = (await releaseResponse.json()) as {
    packages?: Array<{
      code?: string;
      downloadUrl?: string;
      sizeBytes?: number;
      checksumSha256?: string;
    }>;
  };
  const pkg = release.packages?.find((candidate) => candidate.code === "KR");
  if (!pkg?.downloadUrl) throw new Error("KR PDF package unavailable");
  const downloadUrl = pkg.downloadUrl;
  let bytes: Uint8Array | undefined = await readCached(downloadUrl);
  if (!bytes) {
    const response = await fetch(downloadUrl, { cache: "force-cache" });
    if (!response.ok)
      throw new Error(`KR PDF package request failed: ${response.status}`);
    bytes = new Uint8Array(await response.arrayBuffer());
    if (typeof caches !== "undefined")
      await caches.open(PACKAGE_CACHE).then((cache) =>
        cache.put(
          downloadUrl,
          new Response(bytes!.slice().buffer as ArrayBuffer, {
            headers: { "content-type": "application/octet-stream" },
          }),
        ),
      );
  }
  if (pkg.sizeBytes && bytes.byteLength !== pkg.sizeBytes)
    throw new Error("KR PDF package size mismatch");
  if (
    pkg.checksumSha256 &&
    (await sha256(bytes)).toLowerCase() !== pkg.checksumSha256.toLowerCase()
  )
    throw new Error("KR PDF package integrity mismatch");
  return decodePackage(bytes);
}

async function loadMasterPdf(manifest: HymnalPdfManifest) {
  const integrity: PdfIntegrity = {
    ...(manifest.sizeBytes !== undefined
      ? { sizeBytes: manifest.sizeBytes }
      : {}),
    ...(manifest.sha256 ? { sha256: manifest.sha256 } : {}),
  };
  const cacheKey = `${manifest.sourceCommit}:${manifest.masterPath}`;
  const existing = packageRequests.get(cacheKey);
  if (existing) return existing;
  const request = (async () => {
    let lastError: unknown;
    // Prefer the same-origin Worker when configured. It is still constrained
    // by the immutable source commit/path; raw GitHub remains the direct
    // source fallback for Pages previews and native shells.
    for (const url of forkPdfSourceUrls(manifest)) {
      try {
        return await fetchPdf(url, integrity);
      } catch (error) {
        lastError = error;
      }
    }
    // GYSApp-Data is the signed distribution fallback for environments where
    // neither source endpoint serves the immutable master blob.
    try {
      const packaged = await loadDataPackage();
      if (!(await validatePdfBytes(packaged, integrity)))
        throw new Error("KR PDF package integrity validation failed");
      return packaged;
    } catch (error) {
      throw lastError instanceof Error ? lastError : error;
    }
  })();
  packageRequests.set(cacheKey, request);
  try {
    return await request;
  } catch (error) {
    if (packageRequests.get(cacheKey) === request)
      packageRequests.delete(cacheKey);
    throw error;
  }
}

export function forkPdfSourceUrls(
  manifest: {
    sourceRepo: string;
    sourceCommit: string;
    masterPath: string;
  },
  bffBase = BFF_BASE,
): string[] {
  const encodedRepo = manifest.sourceRepo
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const rawForkUrl = `https://raw.githubusercontent.com/${encodedRepo}/${encodeURIComponent(manifest.sourceCommit)}/${manifest.masterPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
  const bffForkUrl = bffBase?.trim()
    ? `${bffBase.trim().replace(/\/$/, "")}/api/v1/content/fork-pdf?commit=${encodeURIComponent(manifest.sourceCommit)}&path=${encodeURIComponent(manifest.masterPath)}`
    : undefined;
  return [bffForkUrl, rawForkUrl].filter((value): value is string =>
    Boolean(value),
  );
}

export function forkManifestSongKey(value: number | string): string {
  const normalized = String(value)
    .trim()
    .replace(/^hymn-/i, "");
  const suffixed = normalized.match(/^(\d+)([a-z])$/i);
  if (suffixed)
    return `${suffixed[1]!.padStart(3, "0")}${suffixed[2]!.toUpperCase()}`;
  if (/^\d+$/.test(normalized)) return normalized.padStart(3, "0");
  return normalized.toUpperCase();
}

export async function loadForkHymnalPdf(numberOrKey: number | string) {
  const manifest = await loadMapping();
  const song = manifest.songs[forkManifestSongKey(numberOrKey)];
  if (!song) throw new Error("Song is not mapped in the fork PDF database");
  const src = forkPdfSourceUrls(manifest)[0];
  if (!src) throw new Error("Fork PDF source is unavailable");
  return {
    src,
    initialPage: song.startPage,
    pageCount: song.pageCount,
    sourceVersion: `${manifest.sourceCommit}:${manifest.masterPath}`,
    source: "GYSApp-Fork PDF database" as const,
  };
}

/** Full bytes are reserved for verified chord geometry or explicit download. */
export async function loadForkHymnalPdfBytes(numberOrKey: number | string) {
  const manifest = await loadMapping();
  const song = manifest.songs[forkManifestSongKey(numberOrKey)];
  if (!song) throw new Error("Song is not mapped in the fork PDF database");
  return {
    bytes: await loadMasterPdf(manifest),
    initialPage: song.startPage,
    pageCount: song.pageCount,
    sourceVersion: `${manifest.sourceCommit}:${manifest.masterPath}`,
    source: "GYSApp-Fork PDF database" as const,
  };
}
