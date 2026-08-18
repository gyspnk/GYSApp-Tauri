import { describe, expect, it } from "vitest";
import {
  decodeDistributedPackage,
  verifyDistributedPackage,
} from "./distributed-package.js";

const packageKey = "yrvxIa8zgtn6cxTLH/+BsLjx5SrgGRQN7IVhK0ufB1Y=";

describe("distributed package decoder", () => {
  it("passes through raw non-GYSPKG payloads", async () => {
    const decoded = await decodeDistributedPackage(new Uint8Array([1, 2, 3]));
    expect([...decoded]).toEqual([1, 2, 3]);
  });

  it("decodes a deterministic GYSPKG1 fixture", async () => {
    const encoded = await buildFixture(
      new TextEncoder().encode("sqlite fixture"),
    );
    const decoded = await decodeDistributedPackage(encoded);
    expect(new TextDecoder().decode(decoded)).toBe("sqlite fixture");
  });

  it("rejects invalid package padding and truncated ciphertext", async () => {
    const encoded = await buildFixture(new TextEncoder().encode("payload"));
    const invalidPadding = encoded.slice();
    const lastIndex = invalidPadding.length - 1;
    invalidPadding[lastIndex] = (invalidPadding[lastIndex] ?? 0) ^ 0xff;
    await expect(decodeDistributedPackage(invalidPadding)).rejects.toThrow();
    await expect(
      decodeDistributedPackage(encoded.slice(0, -5)),
    ).rejects.toThrow();
  });

  it("verifies declared package size and checksum before decoding", async () => {
    const bytes = new Uint8Array([4, 5, 6]);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const checksum = [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    await expect(
      verifyDistributedPackage(
        {
          code: "b_kjv",
          sizeBytes: bytes.byteLength,
          checksumSha256: checksum,
        },
        bytes,
      ),
    ).resolves.toBeUndefined();
  });
});

async function buildFixture(payload: Uint8Array): Promise<Uint8Array> {
  const compressed = new Uint8Array(
    await new Response(
      new Blob([payload.buffer as ArrayBuffer])
        .stream()
        .pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer(),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(atob(packageKey), (value) => value.charCodeAt(0))
      .buffer as ArrayBuffer,
    { name: "AES-CTR" },
    false,
    ["encrypt"],
  );
  const iv = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
  const paddingLength = 16 - (compressed.byteLength % 16);
  const padded = new Uint8Array(compressed.byteLength + paddingLength);
  padded.set(compressed);
  padded.fill(paddingLength, compressed.byteLength);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-CTR", counter: iv.buffer as ArrayBuffer, length: 128 },
      key,
      padded,
    ),
  );
  const output = new Uint8Array(7 + iv.length + encrypted.length);
  output.set(new TextEncoder().encode("GYSPKG1"));
  output.set(iv, 7);
  output.set(encrypted, 7 + iv.length);
  return output;
}
