import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { getDocument } from "../apps/web/node_modules/pdfjs-dist/legacy/build/pdf.mjs";

const root = process.cwd();

function parseArgs(argv) {
  const options = {
    sourceRoot: undefined,
    lock: "packages/contracts/generated/chord-manifest.json",
    musicLock: "apps/web/public/offline/music-lock.json",
    out: "docs/discovery/chord-position-audit.json",
    strict: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--strict") {
      options.strict = true;
      continue;
    }
    const [key, inline] = argument.split("=", 2);
    if (!["--source-root", "--lock", "--music-lock", "--out"].includes(key)) {
      throw new Error(`unknown argument: ${argument}`);
    }
    const value = inline ?? argv[++index];
    if (!value) throw new Error(`missing value for ${key}`);
    if (key === "--source-root") options.sourceRoot = value;
    if (key === "--lock") options.lock = value;
    if (key === "--music-lock") options.musicLock = value;
    if (key === "--out") options.out = value;
  }
  if (!options.sourceRoot) {
    throw new Error(
      "--source-root is required; pass the immutable gyschordweb checkout explicitly",
    );
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const sourceRoot = resolve(root, options.sourceRoot);
const lockPath = resolve(root, options.lock);
const musicLockPath = resolve(root, options.musicLock);
const outPath = resolve(root, options.out);

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function canonicalJsonBytes(bytes) {
  const text = bytes.toString("utf8");
  return Buffer.from(text.replaceAll("\r\n", "\n"), "utf8");
}

function sourcePath(relativePath) {
  const segments = relativePath.replaceAll("\\", "/").split("/");
  const candidates = [
    join(sourceRoot, ...segments),
    join(sourceRoot, "docs", ...segments),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function pdfRelativePath(chordPath) {
  return chordPath
    .replaceAll("\\", "/")
    .replace("/chord/", "/pdf/")
    .replace(/\.chord\.json$/i, ".pdf");
}

function textItem(item) {
  const transform = Array.isArray(item.transform) ? item.transform : [];
  const fontSize =
    Math.abs(Number(transform[3]) || 0) ||
    Math.hypot(Number(transform[0]) || 0, Number(transform[1]) || 0) ||
    0;
  return {
    str: typeof item.str === "string" ? item.str.trim() : "",
    x: Number(transform[4]) || 0,
    y: Number(transform[5]) || 0,
    width: Number(item.width) || 0,
    fontSize,
  };
}

const NOTE_TEXT = /^[0-7.\s]+$/;
const SINGLE_NOTE = /^[0-7.]$/;
const DIGIT_NOTE = /^[1-7]$/;

function dominantFontSize(items) {
  const candidates = items.filter(
    (item) => NOTE_TEXT.test(item.str) && /[1-7]/.test(item.str),
  );
  if (candidates.length === 0) return undefined;
  const counts = new Map();
  for (const item of candidates) {
    const rounded = Math.round(item.fontSize * 10) / 10;
    counts.set(rounded, (counts.get(rounded) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function extractPageNotes(items, pageWidth, pageHeight) {
  const dominant = dominantFontSize(items);
  if (dominant === undefined) return { notes: [], noteRows: [] };
  const noteItems = [];
  for (const item of items.filter(
    (candidate) =>
      NOTE_TEXT.test(candidate.str) &&
      Math.abs(candidate.fontSize - dominant) < 1.5,
  )) {
    if (SINGLE_NOTE.test(item.str) || [...item.str].length <= 1) {
      noteItems.push(item);
      continue;
    }
    const chars = [...item.str];
    const slotWidth = item.width / chars.length;
    for (const [index, character] of chars.entries()) {
      if (!/[0-7.]/.test(character)) continue;
      noteItems.push({
        ...item,
        str: character,
        x: item.x + index * slotWidth,
        width: slotWidth,
      });
    }
  }
  const rows = [];
  for (const item of [...noteItems].sort((a, b) => b.y - a.y)) {
    const existing = rows.find((row) => Math.abs(row.y - item.y) < 2);
    if (existing) existing.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  const musicRows = rows.filter(
    (row) => row.items.filter((item) => DIGIT_NOTE.test(item.str)).length >= 2,
  );
  const notes = [];
  const noteRows = [];
  musicRows.forEach((row, rowIndex) => {
    const rowItems = [...row.items].sort((a, b) => a.x - b.x);
    const firstIdx = notes.length;
    for (const item of rowItems) {
      notes.push({
        ...item,
        idx: notes.length,
        xPct: ((item.x + item.width / 2) / pageWidth) * 100,
        yPct: (1 - item.y / pageHeight) * 100,
      });
    }
    noteRows.push({
      rowIndex,
      y: row.y,
      firstIdx,
      lastIdx: notes.length - 1,
    });
  });
  return { notes, noteRows };
}

function extractLyricLines(items, pageWidth) {
  const lyricItems = items
    .map((item) => ({ ...item, str: item.str.trim() }))
    .filter((item) => item.str.length > 0 && !NOTE_TEXT.test(item.str));
  const rows = [];
  for (const item of [...lyricItems].sort((a, b) => b.y - a.y)) {
    const existing = rows.find((row) => Math.abs(row.y - item.y) < 2);
    if (existing) existing.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  return rows
    .filter((row) => row.items.some((item) => /[A-Za-z]/.test(item.str)))
    .map((row) => {
      const sorted = [...row.items].sort((a, b) => a.x - b.x);
      const start = sorted[0]?.x ?? 0;
      const end = Math.max(...sorted.map((item) => item.x + item.width));
      return {
        y: row.y,
        text: sorted.map((item) => item.str).join(" "),
        startPct: (start / pageWidth) * 100,
        widthPct: Math.max(1, ((end - start) / pageWidth) * 100),
      };
    });
}

function mapEntries(notes, noteRows, lyricLines, entries) {
  const mapped = [];
  const orphan = [];
  let sentinelEntries = 0;
  for (const entry of entries) {
    if (entry.noteIdx === -1 || entry.noteIdx >= 99_999) {
      sentinelEntries += 1;
      mapped.push({
        noteIdx: entry.noteIdx,
        chord: entry.chord,
        lyric: null,
        position: entry.noteIdx === -1 ? 0 : 1,
      });
      continue;
    }
    const note = notes[entry.noteIdx];
    const row = noteRows.find(
      (candidate) =>
        Number.isInteger(entry.noteIdx) &&
        entry.noteIdx >= candidate.firstIdx &&
        entry.noteIdx <= candidate.lastIdx,
    );
    const lyric = row
      ? lyricLines
          .filter(
            (candidate) => candidate.y < row.y && row.y - candidate.y <= 45,
          )
          .sort((a, b) => row.y - a.y - (row.y - b.y))[0]
      : undefined;
    if (!note || !row || !lyric) {
      orphan.push({ noteIdx: entry.noteIdx, chord: entry.chord });
      continue;
    }
    mapped.push({
      noteIdx: entry.noteIdx,
      chord: entry.chord,
      lyric: lyric.text,
      position: Math.max(
        0,
        Math.min(1, (note.xPct - lyric.startPct) / lyric.widthPct),
      ),
    });
  }
  return { mapped, orphan, sentinelEntries };
}

async function auditPdf(pdfBytes, pages) {
  const pdf = await getDocument({
    data: new Uint8Array(pdfBytes),
    disableWorker: true,
    verbosity: 0,
    standardFontDataUrl: new URL(
      "../apps/web/node_modules/pdfjs-dist/standard_fonts/",
      import.meta.url,
    ).toString(),
  }).promise;
  const pageResults = [];
  let invalidEntries = 0;
  let mappedEntries = 0;
  let orphanEntries = 0;
  let sentinelEntries = 0;
  try {
    for (const [pageKey, entries] of Object.entries(pages).sort(
      ([a], [b]) => Number(a) - Number(b),
    )) {
      const pageNumber = Number(pageKey);
      if (
        !Number.isInteger(pageNumber) ||
        pageNumber < 1 ||
        pageNumber > pdf.numPages
      )
        throw new Error(`chord page ${pageKey} is outside PDF page range`);
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items.map(textItem);
      const extracted = extractPageNotes(
        items,
        viewport.width,
        viewport.height,
      );
      const lyrics = extractLyricLines(items, viewport.width);
      const validEntries = [];
      for (const entry of entries) {
        if (
          !entry ||
          !Number.isInteger(entry.noteIdx) ||
          (entry.noteIdx !== -1 &&
            entry.noteIdx < 99_999 &&
            entry.noteIdx >= extracted.notes.length) ||
          typeof entry.chord !== "string" ||
          entry.chord.length === 0
        ) {
          invalidEntries += 1;
        } else validEntries.push(entry);
      }
      const mapping = mapEntries(
        extracted.notes,
        extracted.noteRows,
        lyrics,
        validEntries,
      );
      mappedEntries += mapping.mapped.length;
      orphanEntries += mapping.orphan.length;
      sentinelEntries += mapping.sentinelEntries;
      pageResults.push({
        page: pageNumber,
        pdfNotes: extracted.notes.length,
        notationRows: extracted.noteRows.length,
        lyricRows: lyrics.length,
        chordEntries: entries.length,
        mappedEntries: mapping.mapped.length,
        orphanEntries: mapping.orphan.length,
        sentinelEntries: mapping.sentinelEntries,
        invalidEntries: entries.length - validEntries.length,
        sampleMappings: mapping.mapped.slice(0, 3).map((item) => ({
          noteIdx: item.noteIdx,
          chord: item.chord,
          position: Number(item.position.toFixed(4)),
        })),
      });
    }
  } finally {
    await pdf.cleanup();
  }
  return {
    pdfPages: pdf.numPages,
    auditedPages: pageResults.length,
    pageResults,
    mappedEntries,
    orphanEntries,
    sentinelEntries,
    invalidEntries,
  };
}

const lock = await readJson(lockPath);
const musicLock = await readJson(musicLockPath);
if (
  lock.sourceRepo !== "gyspnk/gyschordweb" ||
  lock.sourceCommit !== "cbc7d386"
)
  throw new Error("unexpected chord lock provenance");
if (!Array.isArray(lock.entries) || lock.entries.length !== 140)
  throw new Error(
    `expected 140 chord entries, got ${lock.entries?.length ?? 0}`,
  );

const files = [];
for (const entry of lock.entries) {
  const chordPath = sourcePath(entry.path);
  if (!chordPath) throw new Error(`missing source chord: ${entry.path}`);
  const sourceChordBytes = await readFile(chordPath);
  const chordBytes = canonicalJsonBytes(sourceChordBytes);
  const actualHash = sha256(chordBytes);
  if (chordBytes.byteLength !== entry.size || actualHash !== entry.sha256)
    throw new Error(`chord integrity drift: ${entry.path}`);
  const document = JSON.parse(chordBytes.toString("utf8"));
  if (document.version !== 2 || document.type !== "note-aligned")
    throw new Error(`unsupported chord schema: ${entry.path}`);
  const pages = document.pages;
  if (!pages || typeof pages !== "object" || Array.isArray(pages))
    throw new Error(`missing chord pages: ${entry.path}`);
  const pdfRelative = pdfRelativePath(entry.path);
  const pdfPath = sourcePath(pdfRelative);
  if (!pdfPath) throw new Error(`missing source PDF: ${pdfRelative}`);
  const pdfBytes = await readFile(pdfPath);
  const pdfLock = musicLock.items?.find(
    (item) => item.kind === "pdf" && item.path === pdfRelative,
  );
  if (
    !pdfLock ||
    pdfBytes.byteLength !== pdfLock.size ||
    sha256(pdfBytes) !== pdfLock.sha256
  )
    throw new Error(`PDF integrity drift: ${pdfRelative}`);
  const audit = await auditPdf(pdfBytes, pages);
  files.push({
    songId: entry.songId,
    chordPath: entry.path,
    chordBytes: chordBytes.byteLength,
    chordSha256: actualHash,
    pdfPath: pdfRelative,
    pdfBytes: pdfBytes.byteLength,
    pdfSha256: sha256(pdfBytes),
    ...audit,
  });
  process.stdout.write(
    `${files.length}/${lock.entries.length} ${entry.songId} ${audit.mappedEntries}/${
      audit.mappedEntries + audit.orphanEntries + audit.invalidEntries
    } mapped\n`,
  );
}

const totals = files.reduce(
  (result, file) => {
    result.pdfPages += file.pdfPages;
    result.auditedPages += file.auditedPages;
    result.chordEntries +=
      file.mappedEntries + file.orphanEntries + file.invalidEntries;
    result.mappedEntries += file.mappedEntries;
    result.orphanEntries += file.orphanEntries;
    result.sentinelEntries += file.sentinelEntries;
    result.invalidEntries += file.invalidEntries;
    return result;
  },
  {
    pdfPages: 0,
    auditedPages: 0,
    chordEntries: 0,
    mappedEntries: 0,
    orphanEntries: 0,
    sentinelEntries: 0,
    invalidEntries: 0,
  },
);

const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  sourceRepo: lock.sourceRepo,
  sourceCommit: lock.sourceCommit,
  lockPath: relative(root, lockPath).replaceAll("\\", "/"),
  musicLockPath: relative(root, musicLockPath).replaceAll("\\", "/"),
  chordCount: files.length,
  totals,
  files,
};
await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  `Chord position audit written to ${relative(root, outPath)}: ${
    totals.mappedEntries
  } mapped, ${totals.orphanEntries} orphan, ${totals.invalidEntries} invalid entries.`,
);
if (options.strict && (totals.orphanEntries > 0 || totals.invalidEntries > 0)) {
  throw new Error(
    `strict chord audit failed: ${totals.orphanEntries} orphan and ${totals.invalidEntries} invalid entries`,
  );
}
