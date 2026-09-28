import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { getDocument } from "../apps/web/node_modules/pdfjs-dist/legacy/build/pdf.mjs";

const root = process.cwd();

function parseArgs(argv) {
  const options = {
    sourceRoot: undefined,
    lock: "packages/contracts/generated/chord-manifest.json",
    musicLock: "apps/web/public/offline/music-lock.json",
    out: "docs/discovery/chord-position-audit.json",
    outExplicit: false,
    fork: false,
    strict: false,
    check: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--strict") {
      options.strict = true;
      continue;
    }
    if (argument === "--check") {
      options.check = true;
      continue;
    }
    if (argument === "--fork") {
      options.fork = true;
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
    if (key === "--out") {
      options.out = value;
      options.outExplicit = true;
    }
  }
  if (options.fork && !options.outExplicit)
    options.out = "docs/discovery/chord-fork-position-audit.json";
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

function normalizeText(text) {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

async function auditPdf(pdfBytes, pages, fork) {
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
  const forkPairing = fork
    ? {
        pagesCompared: 0,
        chordEntriesCompared: 0,
        noteTokenMismatches: 0,
        rowBoundaryMismatches: 0,
        lyricMismatches: 0,
        positionMismatches: 0,
        mappingMismatches: 0,
        pageResults: [],
      }
    : undefined;
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
      if (fork) {
        const forkPageNumber = fork.startPage + pageNumber - 1;
        if (forkPageNumber > fork.startPage + fork.pageCount - 1)
          throw new Error(
            `chord page ${pageNumber} exceeds Fork page mapping for ${fork.songId}`,
          );
        const forkPage = await fork.pdf.getPage(forkPageNumber);
        const forkViewport = forkPage.getViewport({ scale: 1 });
        const forkContent = await forkPage.getTextContent();
        const forkItems = forkContent.items.map(textItem);
        const forkExtracted = extractPageNotes(
          forkItems,
          forkViewport.width,
          forkViewport.height,
        );
        const forkLyrics = extractLyricLines(forkItems, forkViewport.width);
        const rowBounds = (rows) =>
          rows.map(({ firstIdx, lastIdx }) => [firstIdx, lastIdx]);
        const rowBoundaryMismatch =
          JSON.stringify(rowBounds(extracted.noteRows)) !==
          JSON.stringify(rowBounds(forkExtracted.noteRows));
        const forkMapping = mapEntries(
          forkExtracted.notes,
          forkExtracted.noteRows,
          forkLyrics,
          validEntries,
        );
        const keyFor = (item) => `${item.noteIdx}\u0000${item.chord}`;
        const sourceMapped = new Map(
          mapping.mapped.map((item) => [keyFor(item), item]),
        );
        const forkMapped = new Map(
          forkMapping.mapped.map((item) => [keyFor(item), item]),
        );
        const overlayEntries = validEntries.filter(
          (entry) => entry.noteIdx >= 0 && entry.noteIdx < 99_999,
        );
        const noteTokenMismatches = overlayEntries.filter(
          (entry) =>
            extracted.notes[entry.noteIdx]?.str !==
            forkExtracted.notes[entry.noteIdx]?.str,
        ).length;
        let lyricMismatches = 0;
        let positionMismatches = 0;
        let mappingMismatches = 0;
        for (const entry of overlayEntries) {
          const key = keyFor(entry);
          const sourceChord = sourceMapped.get(key);
          const forkChord = forkMapped.get(key);
          if (!sourceChord || !forkChord) {
            mappingMismatches += 1;
            continue;
          }
          if (
            normalizeText(sourceChord.lyric) !== normalizeText(forkChord.lyric)
          )
            lyricMismatches += 1;
          if (Math.abs(sourceChord.position - forkChord.position) > 0.02)
            positionMismatches += 1;
        }
        forkPairing.pagesCompared += 1;
        forkPairing.chordEntriesCompared += overlayEntries.length;
        forkPairing.noteTokenMismatches += noteTokenMismatches;
        forkPairing.rowBoundaryMismatches += Number(rowBoundaryMismatch);
        forkPairing.lyricMismatches += lyricMismatches;
        forkPairing.positionMismatches += positionMismatches;
        forkPairing.mappingMismatches += mappingMismatches;
        forkPairing.pageResults.push({
          page: pageNumber,
          forkPage: forkPageNumber,
          sourceNotes: extracted.notes.length,
          forkNotes: forkExtracted.notes.length,
          rowBoundaryMismatch,
          chordEntriesCompared: overlayEntries.length,
          noteTokenMismatches,
          lyricMismatches,
          positionMismatches,
          mappingMismatches,
        });
      }
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
    ...(forkPairing ? { forkPairing } : {}),
  };
}

const lock = await readJson(lockPath);
const musicLock = await readJson(musicLockPath);
let forkManifest;
let forkPdf;
if (options.fork) {
  forkManifest = await readJson(
    resolve(root, "apps/web/public/offline/fork-hymnal-manifest.json"),
  );
  const forkCommit = "4f0d39bf9a8f6ece5e8f29659940c4fa4072c1a8";
  if (
    forkManifest.sourceRepo !== "ThenGB/GYSAPP-Fork" ||
    !forkCommit.startsWith(forkManifest.sourceCommit) ||
    forkManifest.masterPath !== "assets/data/pdf/kr/kr_master.pdf"
  )
    throw new Error("unexpected Fork PDF provenance");
  const response = await fetch(
    `https://raw.githubusercontent.com/ThenGB/GYSAPP-Fork/${forkCommit}/${forkManifest.masterPath}`,
    { signal: AbortSignal.timeout(60_000) },
  );
  if (!response.ok)
    throw new Error(`Fork master PDF download failed: HTTP ${response.status}`);
  const forkPdfBytes = Buffer.from(await response.arrayBuffer());
  if (
    forkPdfBytes.byteLength !== forkManifest.sizeBytes ||
    sha256(forkPdfBytes) !== forkManifest.sha256
  )
    throw new Error("Fork master PDF failed pinned size/SHA-256 validation");
  forkPdf = await getDocument({
    data: new Uint8Array(forkPdfBytes),
    disableWorker: true,
    verbosity: 0,
    standardFontDataUrl: new URL(
      "../apps/web/node_modules/pdfjs-dist/standard_fonts/",
      import.meta.url,
    ).toString(),
  }).promise;
  if (forkPdf.numPages !== forkManifest.pageCount)
    throw new Error("Fork master PDF page count differs from its manifest");
}
if (
  lock.sourceRepo !== "gyspnk/gyschordweb" ||
  lock.sourceCommit !== "e8e7efe1189b5746a2bb542348e221844091c8d1"
)
  throw new Error("unexpected chord lock provenance");
if (!Array.isArray(lock.entries) || lock.entries.length !== 161)
  throw new Error(
    `expected 161 chord entries, got ${lock.entries?.length ?? 0}`,
  );

const chordListPath = sourcePath("assets-chord-list.json");
const chordDirectory = sourcePath("assets/chord");
if (!chordListPath || !chordDirectory)
  throw new Error("upstream chord inventory is missing");
const chordList = await readJson(chordListPath);
if (
  !Array.isArray(chordList) ||
  chordList.some((stem) => typeof stem !== "string")
)
  throw new Error("upstream chord list has an invalid shape");
const chordInventories = [
  chordList.map((stem) => stem + ".chord.json"),
  (await readdir(chordDirectory)).filter((name) =>
    name.endsWith(".chord.json"),
  ),
  lock.entries.map((entry) => entry.path.split("/").at(-1)),
].map((names) => JSON.stringify([...names].sort()));
if (new Set(chordInventories).size !== 1)
  throw new Error(
    "upstream chord list, source files, and generated lock differ",
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
  const songNumber = entry.songId.match(/^hymn-(\d+)$/)?.[1];
  const forkSong = forkManifest?.songs?.[songNumber];
  if (forkManifest && !forkSong)
    throw new Error(`Fork master has no mapping for ${entry.songId}`);
  const lastChordPage = Math.max(...Object.keys(pages).map(Number));
  if (forkSong && forkSong.pageCount < lastChordPage)
    throw new Error(`Fork page count is too short for ${entry.songId}`);
  const audit = await auditPdf(
    pdfBytes,
    pages,
    forkSong
      ? {
          pdf: forkPdf,
          songId: entry.songId,
          startPage: forkSong.startPage,
          pageCount: forkSong.pageCount,
        }
      : undefined,
  );
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
    } mapped${audit.forkPairing ? `; Fork ${audit.forkPairing.pagesCompared} pages` : ""}\n`,
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

if (forkPdf) await forkPdf.cleanup();
const forkPairingTotals = options.fork
  ? files.reduce(
      (result, file) => {
        const pairing = file.forkPairing;
        result.pagesCompared += pairing.pagesCompared;
        result.chordEntriesCompared += pairing.chordEntriesCompared;
        for (const key of [
          "noteTokenMismatches",
          "rowBoundaryMismatches",
          "lyricMismatches",
          "positionMismatches",
          "mappingMismatches",
        ])
          result[key] += pairing[key];
        return result;
      },
      {
        pagesCompared: 0,
        chordEntriesCompared: 0,
        noteTokenMismatches: 0,
        rowBoundaryMismatches: 0,
        lyricMismatches: 0,
        positionMismatches: 0,
        mappingMismatches: 0,
      },
    )
  : undefined;
const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  sourceRepo: lock.sourceRepo,
  sourceCommit: lock.sourceCommit,
  lockPath: relative(root, lockPath).replaceAll("\\", "/"),
  musicLockPath: relative(root, musicLockPath).replaceAll("\\", "/"),
  chordCount: files.length,
  totals,
  ...(forkPairingTotals
    ? {
        forkSourceRepo: forkManifest.sourceRepo,
        forkSourceCommit: forkManifest.sourceCommit,
        forkMasterSha256: forkManifest.sha256,
        forkPairingTotals,
      }
    : {}),
  files,
};
const forkMismatches = forkPairingTotals
  ? Object.entries(forkPairingTotals)
      .filter(([key]) => key.endsWith("Mismatches"))
      .reduce((total, [, value]) => total + value, 0)
  : 0;
if (options.check) {
  const previous = JSON.parse(await readFile(outPath, "utf8"));
  const { generatedAt: _previousGeneratedAt, ...previousReport } = previous;
  const { generatedAt: _generatedAt, ...currentReport } = report;
  if (JSON.stringify(previousReport) !== JSON.stringify(currentReport)) {
    throw new Error(
      `chord position audit drifted from committed report: ${relative(root, outPath)}`,
    );
  }
  console.log(
    `Chord position audit matches committed report (${totals.mappedEntries} mapped, ${totals.orphanEntries} orphan, ${totals.invalidEntries} invalid).`,
  );
  if (forkPairingTotals)
    console.log(
      `Fork master pairing matches committed report (${forkPairingTotals.pagesCompared} pages, ${forkPairingTotals.chordEntriesCompared} chord entries, ${forkMismatches} mismatches).`,
    );
} else {
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(
    `Chord position audit written to ${relative(root, outPath)}: ${
      totals.mappedEntries
    } mapped, ${totals.orphanEntries} orphan, ${totals.invalidEntries} invalid entries.`,
  );
  if (forkPairingTotals)
    console.log(
      `Fork master pairing: ${forkPairingTotals.pagesCompared} pages, ${forkPairingTotals.chordEntriesCompared} chord entries, ${forkMismatches} mismatches.`,
    );
}
if (
  options.strict &&
  (totals.orphanEntries > 0 || totals.invalidEntries > 0 || forkMismatches > 0)
) {
  throw new Error(
    `strict chord audit failed: ${totals.orphanEntries} orphan, ${totals.invalidEntries} invalid, ${forkMismatches} cross-source mismatches`,
  );
}
