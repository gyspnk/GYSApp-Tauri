import type { DistributedAssetPackage } from "@gys/contracts";
import { sha256 } from "./asset-store.js";

const PACKAGE_MAGIC = new TextEncoder().encode("GYSPKG1");
const PACKAGE_KEY_BASE64 = "yrvxIa8zgtn6cxTLH/+BsLjx5SrgGRQN7IVhK0ufB1Y=";
let packageKeyPromise: Promise<CryptoKey> | undefined;

function hasPackageMagic(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PACKAGE_MAGIC.byteLength) return false;
  return PACKAGE_MAGIC.every((value, index) => bytes[index] === value);
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function packageKey(): Promise<CryptoKey> {
  packageKeyPromise ??= crypto.subtle.importKey(
    "raw",
    decodeBase64(PACKAGE_KEY_BASE64).buffer as ArrayBuffer,
    { name: "AES-CTR" },
    false,
    ["decrypt"],
  );
  return packageKeyPromise;
}

function removePkcs7Padding(bytes: Uint8Array): Uint8Array {
  const padding = bytes.at(-1);
  if (
    padding === undefined ||
    padding < 1 ||
    padding > 16 ||
    padding > bytes.length
  ) {
    throw new Error("Distributed package padding is invalid");
  }
  for (let index = bytes.length - padding; index < bytes.length; index += 1) {
    if (bytes[index] !== padding) {
      throw new Error("Distributed package padding is invalid");
    }
  }
  return bytes.slice(0, bytes.length - padding);
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Gzip decompression is unavailable in this browser");
  }
  const stream = new Blob([bytes.buffer as ArrayBuffer])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function verifyDistributedPackage(
  pkg: Pick<DistributedAssetPackage, "code" | "sizeBytes" | "checksumSha256">,
  bytes: Uint8Array,
): Promise<void> {
  if (bytes.byteLength !== pkg.sizeBytes) {
    throw new Error(`Distributed package size mismatch for ${pkg.code}`);
  }
  const actual = await sha256(bytes);
  if (actual.toLowerCase() !== pkg.checksumSha256.toLowerCase()) {
    throw new Error(`Distributed package checksum mismatch for ${pkg.code}`);
  }
}

/** Decode GYSApp-Data's GYSPKG1 payload, or pass through raw assets. */
export async function decodeDistributedPackage(
  bytes: Uint8Array,
): Promise<Uint8Array> {
  if (!hasPackageMagic(bytes)) return bytes.slice();
  const ivStart = PACKAGE_MAGIC.byteLength;
  const cipherStart = ivStart + 16;
  if (bytes.byteLength <= cipherStart) {
    throw new Error("Distributed package is truncated");
  }
  const iv = bytes.slice(ivStart, cipherStart);
  const decrypted = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-CTR", counter: iv.buffer as ArrayBuffer, length: 128 },
      await packageKey(),
      bytes.slice(cipherStart).buffer as ArrayBuffer,
    ),
  );
  return gunzip(removePkcs7Padding(decrypted));
}
