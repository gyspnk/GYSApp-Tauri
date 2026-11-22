/**
 * Zero-dependency pure-Node PNG generator that crops the official Gereja Yesus Sejati
 * dove emblem (x=0..431, y=0..265) from apps/web/public/assets/gys-logo.png and centers
 * it onto a crisp 512x512 pure-white RGBA icon canvas for `tauri icon` in GitHub Actions.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function decodePngRgba(buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(
      `Expected 8-bit RGBA PNG, got depth=${bitDepth}, colorType=${colorType}`,
    );
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const pixels = Buffer.alloc(height * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const rowStart = y * stride;
    const rawStart = y * (stride + 1) + 1;
    for (let i = 0; i < stride; i += 1) {
      const x = raw[rawStart + i];
      const a = i >= bpp ? pixels[rowStart + i - bpp] : 0;
      const b = y > 0 ? pixels[rowStart - stride + i] : 0;
      const c = y > 0 && i >= bpp ? pixels[rowStart - stride + i - bpp] : 0;
      let v = x;
      if (filter === 1) v = (x + a) & 0xff;
      else if (filter === 2) v = (x + b) & 0xff;
      else if (filter === 3) v = (x + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) v = (x + paeth(a, b, c)) & 0xff;
      pixels[rowStart + i] = v;
    }
  }
  return { width, height, pixels };
}

function encodePngRgba(width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", deflateSync(raw, { level: 9 })),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

const outPath = resolve(process.argv[2] ?? "gys-dove-icon.png");
const srcPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../apps/web/public/assets/gys-logo.png",
);
const { width, pixels } = decodePngRgba(readFileSync(srcPath));

const cropW = 432;
const cropH = 265;
const size = 512;
const canvas = Buffer.alloc(size * size * 4, 255);
const offsetX = Math.floor((size - cropW) / 2);
const offsetY = Math.floor((size - cropH) / 2);

for (let y = 0; y < cropH; y += 1) {
  for (let x = 0; x < cropW; x += 1) {
    const si = (y * width + x) * 4;
    const di = ((y + offsetY) * size + (x + offsetX)) * 4;
    const alpha = pixels[si + 3] / 255;
    canvas[di] = Math.round(pixels[si] * alpha + 255 * (1 - alpha));
    canvas[di + 1] = Math.round(pixels[si + 1] * alpha + 255 * (1 - alpha));
    canvas[di + 2] = Math.round(pixels[si + 2] * alpha + 255 * (1 - alpha));
    canvas[di + 3] = 255;
  }
}

writeFileSync(outPath, encodePngRgba(size, size, canvas));
console.log(
  `Generated official GYS Dove app icon PNG (${size}x${size}): ${outPath}`,
);
