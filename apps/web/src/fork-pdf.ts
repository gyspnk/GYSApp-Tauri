import {
  HymnalPdfManifestSchema,
  type HymnalPdfManifest,
} from "@gys/contracts";

const RELEASE_MANIFEST =
  "https://raw.githubusercontent.com/ThenGB/GYSApp-Data/main/latest/hymnals-manifest.json";
const FALLBACK_MANIFEST = `${import.meta.env.BASE_URL}offline/fork-hymnal-manifest.json`;
const KEY_BYTES = Uint8Array.from(
  atob("yrvxIa8zgtn6cxTLH/+BsLjx5SrgGRQN7IVhK0ufB1Y="),
  (value) => value.charCodeAt(0),
);
let mapping: Promise<HymnalPdfManifest> | undefined;
let packageRequest: Promise<Uint8Array> | undefined;

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

async function loadMasterPdf() {
  packageRequest ??= (async () => {
    const release = (await (
      await fetch(RELEASE_MANIFEST, { cache: "no-cache" })
    ).json()) as {
      packages?: Array<{
        code?: string;
        downloadUrl?: string;
        sizeBytes?: number;
        checksumSha256?: string;
      }>;
    };
    const pkg = release.packages?.find((candidate) => candidate.code === "KR");
    if (!pkg?.downloadUrl) throw new Error("KR PDF package unavailable");
    const bytes = new Uint8Array(
      await (
        await fetch(pkg.downloadUrl, { cache: "force-cache" })
      ).arrayBuffer(),
    );
    if (pkg.sizeBytes && bytes.byteLength !== pkg.sizeBytes)
      throw new Error("KR PDF package size mismatch");
    if (
      pkg.checksumSha256 &&
      (await sha256(bytes)).toLowerCase() !== pkg.checksumSha256.toLowerCase()
    )
      throw new Error("KR PDF package integrity mismatch");
    return decodePackage(bytes);
  })();
  return packageRequest;
}

export async function loadForkHymnalPdf(number: number) {
  const manifest = await loadMapping();
  const song = manifest.songs[String(number).padStart(3, "0")];
  if (!song) throw new Error("Song is not mapped in the fork PDF database");
  return {
    bytes: await loadMasterPdf(),
    initialPage: song.startPage,
    pageCount: song.pageCount,
    source: "GYSApp-Fork PDF database" as const,
  };
}
