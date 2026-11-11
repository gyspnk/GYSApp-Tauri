import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";
import {
  artifactName,
  indexPngs,
  pixelHash,
  plan,
} from "./adopt-baselines.mjs";

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer)
    value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A 1x1 RGBA PNG whose single pixel is `rgba`. */
function png(rgba, extraChunk) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  const scanline = Buffer.from([0, ...rgba]);
  const parts = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
  ];
  if (extraChunk)
    parts.push(chunk("tEXt", Buffer.from("note\u0000local render")));
  parts.push(
    chunk("IDAT", deflateSync(scanline)),
    chunk("IEND", Buffer.alloc(0)),
  );
  return Buffer.concat(parts);
}

function fixture() {
  return mkdtempSync(join(tmpdir(), "gys-baselines-test-"));
}

test("the same pixels hash the same even when the file metadata differs", () => {
  const root = fixture();
  const plain = join(root, "plain.png");
  const annotated = join(root, "annotated.png");
  writeFileSync(plain, png([1, 2, 3, 255]));
  writeFileSync(annotated, png([1, 2, 3, 255], true));
  assert.notEqual(plain, annotated);
  assert.equal(pixelHash(plain), pixelHash(annotated));
});

test("different pixels hash differently", () => {
  const root = fixture();
  const first = join(root, "a.png");
  const second = join(root, "b.png");
  writeFileSync(first, png([1, 2, 3, 255]));
  writeFileSync(second, png([1, 2, 4, 255]));
  assert.notEqual(pixelHash(first), pixelHash(second));
});

test("a file that is not a PNG reports no pixel hash", () => {
  const root = fixture();
  const file = join(root, "not.png");
  writeFileSync(file, "nope");
  assert.equal(pixelHash(file), null);
});

test("indexPngs walks nested artifact folders", () => {
  const root = fixture();
  mkdirSync(join(root, "visual.spec.ts-snapshots"), { recursive: true });
  writeFileSync(
    join(root, "visual.spec.ts-snapshots", "home-390x844-linux.png"),
    png([0, 0, 0, 255]),
  );
  writeFileSync(join(root, "readme.txt"), "ignore me");
  const found = indexPngs(root);
  assert.equal(found.size, 1);
  assert.ok(found.has("home-390x844-linux.png"));
});

test("plan separates identical, changed and unknown screenshots", () => {
  const artifact = fixture();
  const repo = fixture();
  writeFileSync(join(artifact, "same.png"), png([9, 9, 9, 255]));
  writeFileSync(join(repo, "same.png"), png([9, 9, 9, 255], true));
  writeFileSync(join(artifact, "moved.png"), png([1, 1, 1, 255]));
  writeFileSync(join(repo, "moved.png"), png([2, 2, 2, 255]));
  writeFileSync(join(artifact, "new.png"), png([3, 3, 3, 255]));
  const result = plan(indexPngs(artifact), indexPngs(repo));
  assert.equal(result.same, 1);
  assert.deepEqual(
    result.changed.map((item) => item.name),
    ["moved.png"],
  );
  assert.deepEqual(result.missing, ["new.png"]);
  assert.equal(result.bytesOnly.length, 0);
});

test("an artifact name only accepts a numeric run id", () => {
  assert.equal(artifactName(43068909386), "visual-baselines-43068909386");
  assert.throws(() => artifactName("latest"), /digits/);
});
