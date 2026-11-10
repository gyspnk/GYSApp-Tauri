/**
 * Sec-MS-GEC version 2 tokens for Edge read-aloud.
 *
 * Microsoft moved the handshake from a plain SHA-256 digest (`1-<version>`) to
 * a two-part digest, `<cs64>-<sha256>` (`2-<version>`), in October 2026. The
 * digest itself is a modified SHA-256 (patched schedule constants) plus a CS64
 * mixer, so a stock `crypto.subtle.digest` no longer produces an accepted token
 * and every synthesis answers 403.
 *
 * This is a faithful port of `generate_sec_ms_gec_v2` from edge-tts 7.3
 * (src/edge_tts/drm.py). Tests compare it against that reference for fixed
 * timestamps, so a transcription slip cannot pass unnoticed.
 */

export const EDGE_TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WINDOWS_EPOCH_SECONDS = 11_644_473_600;
const FIVE_MINUTES_SECONDS = 300;
const MASK = 0xffffffff;

const INITIAL_STATE = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
];

const PATCHED_STATE = [
  0xfd9fbea2, 0x91243ce7, 0xbe499094, 0xcd2e1e0a, 0x6c006f49, 0x04bd35ab,
  0xfeb0a7e4, 0x03effbd2,
];

const SHA256_SCHEDULE = [
  0xeb24bf9e, 0x1558691f, 0xa0c09ee2, 0x0cfa32ba, 0xa622ee8c, 0xd1dd9491,
  0xc0dd25a0, 0xf9e70ab6, 0xf0c31573, 0x7058ce4e, 0x7188e606, 0x00e5ab33,
  0xd258b060, 0x72766564,
];

const ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const ADJUSTMENT = 0xc9dc06a7;
const BLOCK_CONSTANTS = [
  ...ROUND_CONSTANTS.slice(0, 14),
  ADJUSTMENT,
  ...ROUND_CONSTANTS.slice(15),
];
const SIGMA0_ADJUSTMENT = 0x059c0b80;
const SIGMA1_ADJUSTMENT = 0x000b92c0;

const CS64_COEFFICIENTS: readonly [number, number][] = [
  [0xe82e91b1, 0xb32700d0],
  [0x44de24c6, 0x88dff51d],
  [0x3beb65bc, 0x29514038],
  [0xc89c5933, 0xb328cbdf],
  [0x8d1ec211, 0xd405b4d5],
  [0x314ef5d5, 0x26e55f3c],
  [0xe92491b1, 0x607801c6],
  [0xf0a5b9d5, 0x82b2c1fb],
  [0x06064cf3, 0xfa51a3da],
  [0xda79fa60, 0x207cc464],
  [0xbed20560, 0x3c3c74f3],
  [0x89f9c9f8, 0xd2d14b61],
  [0x35fa38c6, 0xbb04a2c1],
  [0xcb49e3c6, 0xc5626167],
];
const CS64_FACTOR = 0x82893933;
const CS64_ADJUSTMENT0 = 0xf2f90b1a;
const CS64_ADJUSTMENT1 = 0x0b1a0000;

function rol16(value: number): number {
  const word = value & MASK;
  return (((word << 16) | (word >>> 16)) & MASK) >>> 0;
}

function rotr(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/** Little-endian 32-bit words, zero padded to an even count. */
function wordsLe4Even(data: Uint8Array): number[] {
  const padded = new Uint8Array(Math.ceil(data.length / 4) * 4);
  padded.set(data);
  const view = new DataView(padded.buffer);
  const words: number[] = [];
  for (let index = 0; index < padded.length; index += 4)
    words.push(view.getUint32(index, true));
  if (words.length % 2 === 1) words.push(0);
  return words;
}

function scheduleSigma1(value: number): number {
  return (rotr(value, 17) ^ rotr(value, 19) ^ (value >>> 10)) >>> 0;
}

function scheduleSigma0(value: number): number {
  return (rotr(value, 7) ^ rotr(value, 18) ^ (value >>> 3)) >>> 0;
}

const bigSigma0 = (value: number): number =>
  (rotr(value, 2) ^ rotr(value, 13) ^ rotr(value, 22)) >>> 0;
const bigSigma1 = (value: number): number =>
  (rotr(value, 6) ^ rotr(value, 11) ^ rotr(value, 25)) >>> 0;
const choice = (x: number, y: number, z: number): number =>
  (z ^ (x & (y ^ z))) >>> 0;
const majority = (x: number, y: number, z: number): number =>
  ((x & y) | (z & (x | y))) >>> 0;

function sha256Rounds(
  state: readonly number[],
  words: readonly number[],
  firstRound = 0,
): number[] {
  let [a, b, c, d, e, f, g, h] = state as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const constants = firstRound === 14 ? BLOCK_CONSTANTS : ROUND_CONSTANTS;
  for (let index = firstRound; index < 64; index += 1) {
    const t1 =
      (h +
        bigSigma1(e) +
        choice(e, f, g) +
        constants[index]! +
        words[index]!) >>>
      0;
    const t2 = (bigSigma0(a) + majority(a, b, c)) >>> 0;
    h = g;
    g = f;
    f = e;
    e = (d + t1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) >>> 0;
  }
  return [a, b, c, d, e, f, g, h];
}

function expandSchedule(words: number[], firstWord = 16): void {
  for (let index = firstWord; index < 64; index += 1) {
    const sigma1 = scheduleSigma1(words[index - 2]!);
    const sigma0 = scheduleSigma0(words[index - 15]!);
    words.push(
      (sigma1 + words[index - 7]! + sigma0 + words[index - 16]!) >>> 0,
    );
  }
}

function sha256Init(head: Uint8Array): number[] {
  const words: number[] = new Array(14).fill(0);
  words.push(((head[0]! << 16) | (head[1]! << 8) | head[2]!) >>> 0);
  words.push(
    ((head[3]! << 24) | (head[4]! << 16) | (head[5]! << 8) | head[6]!) >>> 0,
  );
  for (let index = 16; index < 30; index += 1) {
    let value = SHA256_SCHEDULE[index - 16]!;
    if (index - 2 >= 14) {
      const sigma1 = scheduleSigma1(words[index - 2]!);
      value += index === 16 ? (sigma1 ^ SIGMA1_ADJUSTMENT) >>> 0 : sigma1;
    }
    if (index - 7 >= 14) value += words[index - 7]!;
    if (index - 15 >= 14) {
      const sigma0 = scheduleSigma0(words[index - 15]!);
      value += index === 29 ? (sigma0 ^ SIGMA0_ADJUSTMENT) >>> 0 : sigma0;
    }
    words.push(value >>> 0);
  }
  words.push(
    (scheduleSigma1(words[28]!) +
      words[23]! +
      scheduleSigma0(words[15]!) +
      words[14]! +
      ADJUSTMENT -
      ROUND_CONSTANTS[14]!) >>>
      0,
  );
  expandSchedule(words, 31);
  const working = sha256Rounds(PATCHED_STATE, words, 14);
  return INITIAL_STATE.map((value, index) => (value + working[index]!) >>> 0);
}

function sha256Digest(data: Uint8Array): Uint8Array {
  if (data.length < 7) throw new Error("Token salt must contain seven bytes");
  const length = 57 + data.length;
  const rest = data.subarray(7);
  const padding = (((55 - length) % 64) + 64) % 64;
  const padded = new Uint8Array(rest.length + 1 + padding + 8);
  padded.set(rest);
  padded[rest.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = BigInt(length) * 8n;
  view.setBigUint64(padded.length - 8, bits, false);
  let state = sha256Init(data.subarray(0, 7));
  for (let offset = 0; offset < padded.length; offset += 64) {
    const words: number[] = [];
    for (let index = 0; index < 16; index += 1)
      words.push(view.getUint32(offset + index * 4, false));
    expandSchedule(words);
    const working = sha256Rounds(state, words);
    state = state.map((value, index) => (value + working[index]!) >>> 0);
  }
  const digest = new Uint8Array(32);
  const out = new DataView(digest.buffer);
  state.forEach((value, index) => out.setUint32(index * 4, value, false));
  return digest;
}

function cs64Digest(data: Uint8Array, digest: Uint8Array): [number, number] {
  const view = new DataView(
    digest.buffer,
    digest.byteOffset,
    digest.byteLength,
  );
  const keyA = (view.getUint32(0, true) | 1) >>> 0;
  const keyB = (view.getUint32(4, true) | 1) >>> 0;
  const factors = [
    Math.imul(keyA, CS64_FACTOR) >>> 0,
    Math.imul(keyB, CS64_FACTOR) >>> 0,
  ];
  const terms: number[] = CS64_COEFFICIENTS.map(
    ([coefficient], index) => Math.imul(coefficient, factors[index % 2]!) >>> 0,
  );
  const offsets: number[] = CS64_COEFFICIENTS.map(([, offset]) => offset);
  const salt = new Uint8Array(data.length + 1);
  salt.set(data, 1);
  wordsLe4Even(salt).forEach((word, index) => {
    const key = index % 2 === 0 ? keyA : keyB;
    let term = Math.imul(word, key) >>> 0;
    let offset =
      Math.imul(rol16(word), index % 2 === 0 ? 0xef0569fb : 0xc31713db) >>> 0;
    if (index === 0) {
      term = (term + Math.imul(CS64_ADJUSTMENT0, factors[0]!)) >>> 0;
      offset = (offset + CS64_ADJUSTMENT1) >>> 0;
    }
    terms.push(term);
    offsets.push(offset);
  });
  let swapAcc = 0;
  let swapLast = 0;
  let state = 0;
  let acc = 0;
  for (let index = 0; index < terms.length; index += 2) {
    const x = terms[index]!;
    const y = terms[index + 1]!;
    let t = rol16((offsets[index]! + x) >>> 0);
    let q = Math.imul(t, 0x76f50f34) >>> 0;
    swapAcc = (swapAcc + ((Math.imul(rol16(q), 0xc3efea97) + q) >>> 0)) >>> 0;
    t = rol16((offsets[index + 1]! + y) >>> 0);
    q = Math.imul(t, 0x1881ce3c) >>> 0;
    swapLast = (Math.imul(rol16(q), 0x35bd1ec9) + q) >>> 0;
    swapAcc = (swapAcc + swapLast) >>> 0;

    state = (Math.imul(state, keyA) + x) >>> 0;
    state = Math.imul(rol16(state), 0xcf98b111) >>> 0;
    state = Math.imul(rol16(state), 0x87085b9f) >>> 0;
    state = Math.imul(rol16(state), 0x12ceb96d) >>> 0;
    state = Math.imul(rol16(state), 0x257e1d83) >>> 0;
    acc = (acc + state) >>> 0;
    let next = (Math.imul(state, keyB) + y) >>> 0;
    next = Math.imul(rol16(next), 0xa27416f5) >>> 0;
    next = Math.imul(rol16(next), 0xd38396ff) >>> 0;
    state =
      Math.imul(rol16(Math.imul(rol16(next), 0x7c932b89) >>> 0), 0xbfa49f69) >>>
      0;
    acc = (acc + state) >>> 0;
  }
  return [(swapLast ^ state) >>> 0, (swapAcc ^ acc) >>> 0];
}

function leHex(value: number): string {
  const word = value >>> 0;
  return [0, 8, 16, 24]
    .map((shift) => ((word >>> shift) & 0xff).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** Both digest halves for one salt, in the order the handshake expects. */
export function edgeTokenDigest(salt: Uint8Array): [string, string] {
  const digest = sha256Digest(salt);
  const [low, high] = cs64Digest(salt, digest);
  const cs64 = leHex(low) + leHex(high);
  const sha = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return [cs64, sha];
}

/** Windows file time ticks in 100 ns units, rounded down to five minutes. */
export function edgeTokenTicks(nowMs: number): string {
  let seconds = Math.floor(nowMs / 1_000) + WINDOWS_EPOCH_SECONDS;
  seconds -=
    ((seconds % FIVE_MINUTES_SECONDS) + FIVE_MINUTES_SECONDS) %
    FIVE_MINUTES_SECONDS;
  return `${seconds}0000000`;
}

export function generateSecMsGecV2(nowMs = Date.now()): string {
  const salt = new TextEncoder().encode(
    `${edgeTokenTicks(nowMs)}${EDGE_TRUSTED_CLIENT_TOKEN}`,
  );
  const [cs64, sha] = edgeTokenDigest(salt);
  return `${cs64}-${sha}`;
}

export const SEC_MS_GEC_VERSION_PREFIX = "2";
