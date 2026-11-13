import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";
import {
  artifactName,
  decodePng,
  indexPngs,
  pixelDiff,
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
  return pngRows([rgba], extraChunk);
}

/** An Nx1 RGBA PNG, one pixel per entry of `rows`. */
function pngRows(rows, extraChunk) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(rows.length, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  const scanline = Buffer.from([0, ...rows.flat()]);
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

test("decodePng reads the pixels back", () => {
  const root = fixture();
  const file = join(root, "two.png");
  writeFileSync(
    file,
    pngRows([
      [10, 20, 30, 255],
      [40, 50, 60, 255],
    ]),
  );
  const decoded = decodePng(file);
  assert.equal(decoded.width, 2);
  assert.equal(decoded.height, 1);
  assert.deepEqual([...decoded.pixels], [10, 20, 30, 255, 40, 50, 60, 255]);
});

test("pixelDiff counts moved pixels and reports their box", () => {
  const root = fixture();
  const before = join(root, "before.png");
  const after = join(root, "after.png");
  writeFileSync(
    before,
    pngRows([
      [0, 0, 0, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255],
    ]),
  );
  writeFileSync(
    after,
    pngRows([
      [0, 0, 0, 255],
      [255, 255, 255, 255],
      [0, 0, 0, 255],
    ]),
  );
  const result = pixelDiff(before, after);
  assert.equal(result.diff, 1);
  assert.deepEqual(result.box, { left: 1, top: 0, right: 1, bottom: 0 });
});

test("pixelDiff ignores a difference below the threshold", () => {
  const root = fixture();
  const before = join(root, "a.png");
  const after = join(root, "b.png");
  writeFileSync(before, png([100, 100, 100, 255]));
  writeFileSync(after, png([104, 104, 104, 255]));
  assert.deepEqual(pixelDiff(before, after), { diff: 0, box: null });
});

test("pixelDiff refuses images of different sizes", () => {
  const root = fixture();
  const small = join(root, "small.png");
  const wide = join(root, "wide.png");
  writeFileSync(small, png([1, 1, 1, 255]));
  writeFileSync(
    wide,
    pngRows([
      [1, 1, 1, 255],
      [1, 1, 1, 255],
    ]),
  );
  assert.equal(pixelDiff(small, wide), null);
});

test("plan records how many pixels each changed screenshot moved", () => {
  const artifact = fixture();
  const repo = fixture();
  writeFileSync(join(artifact, "moved.png"), png([0, 0, 0, 255]));
  writeFileSync(join(repo, "moved.png"), png([255, 255, 255, 255]));
  const result = plan(indexPngs(artifact), indexPngs(repo));
  assert.equal(result.changed[0].diff, 1);
  assert.deepEqual(result.changed[0].box, {
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  });
});

test("an artifact name only accepts a numeric run id", () => {
  assert.equal(artifactName(43068909386), "visual-baselines-43068909386");
  assert.throws(() => artifactName("latest"), /digits/);
});
