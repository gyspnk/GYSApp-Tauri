import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const sourceRoot = process.env.GYSCHORDWEB_SNAPSHOT;
const sourceCommit =
  process.env.GYSCHORDWEB_COMMIT ?? "e8e7efe1189b5746a2bb542348e221844091c8d1";
if (!sourceRoot)
  throw new Error(
    "Set GYSCHORDWEB_SNAPSHOT to an immutable gyschordweb snapshot.",
  );

const source = JSON.parse(
  await readFile(join(sourceRoot, "docs", "assets-lyrics.json"), "utf8"),
);
const chordManifest = JSON.parse(
  await readFile(
    join("packages", "contracts", "generated", "chord-manifest.json"),
    "utf8",
  ),
);
if (chordManifest.sourceCommit !== sourceCommit)
  throw new Error("Chord manifest does not match the hymn source commit.");
const chordRefs = new Map(
  chordManifest.entries.map((entry) => [entry.songId, entry]),
);
const items = source.map((entry) => {
  const number = Number.parseInt(entry.number, 10);
  const stem = `${entry.number}_${entry.title}`;
  const id = `hymn-${entry.number}`;
  const chordRef = chordRefs.get(id);
  return {
    id,
    book: "rohani",
    number,
    title: entry.title,
    verses: entry.verses,
    lyrics: entry.verses.join("\n\n"),
    midiPath: `assets/midi/${stem}.mid`,
    pdfPath: `assets/pdf/${stem}.pdf`,
    ...(chordRef ? { chordRef } : {}),
  };
});

await mkdir(join("packages", "contracts", "generated"), { recursive: true });
await writeFile(
  join("packages", "contracts", "generated", "hymn-catalog.json"),
  `${JSON.stringify({ sourceRepo: "gyspnk/gyschordweb", sourceCommit, generatedAt: new Date().toISOString(), books: ["rohani", "kidung-jemaat", "pujian", "anak", "mandarin", "english"], items }, null, 2)}\n`,
  "utf8",
);
console.log(
  `Generated ${items.length} hymn metadata/lyrics entries from ${sourceCommit}.`,
);
