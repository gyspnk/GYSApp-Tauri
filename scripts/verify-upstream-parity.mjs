import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const commit = "e8e7efe1189b5746a2bb542348e221844091c8d1";
const expectedSourceHash =
  "1b97233984e61db36d003800b4011f6a6fc1afee9ad5f08b268cc7c66173a670";
const sourceRoot = process.argv[2] ?? process.env.GYSCHORDWEB_SNAPSHOT;
assert.ok(
  sourceRoot,
  "Pass the immutable upstream snapshot root; this audit never downloads or rewrites source data",
);
const bytes = await readFile(resolve(sourceRoot, "docs/assets-lyrics.json"));
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  expectedSourceHash,
  "Upstream lyric bytes must match the pinned commit",
);
const source = JSON.parse(bytes);
const catalog = JSON.parse(
  await readFile("apps/web/public/offline/hymn-catalog.json", "utf8"),
);
const metadata = JSON.parse(
  await readFile("apps/web/public/offline/hymn-metadata.json", "utf8"),
);
const chords = JSON.parse(
  await readFile("packages/contracts/generated/chord-manifest.json", "utf8"),
);
assert.equal(catalog.sourceCommit, commit);
assert.equal(metadata.sourceCommit, commit);
assert.equal(chords.sourceCommit, commit);
assert.equal(source.length, 533);
assert.equal(catalog.items.length, source.length);
assert.equal(chords.entries.length, 161);
const chordMap = new Map(chords.entries.map((entry) => [entry.songId, entry]));
for (const [index, entry] of source.entries()) {
  const actual = catalog.items[index];
  const stem = `${entry.number}_${entry.title}`;
  assert.equal(actual.id, `hymn-${entry.number}`);
  assert.equal(actual.title, entry.title);
  assert.equal(actual.number, Number.parseInt(entry.number, 10));
  assert.deepEqual(actual.verses, entry.verses);
  assert.equal(actual.lyrics, entry.verses.join("\n\n"));
  assert.equal(actual.midiPath, `assets/midi/${stem}.mid`);
  assert.equal(actual.pdfPath, `assets/pdf/${stem}.pdf`);
  assert.deepEqual(actual.chordRef, chordMap.get(actual.id));
  const { lyrics, verses, ...onlyMetadata } = actual;
  assert.deepEqual(metadata.items[index], onlyMetadata);
}
console.log(
  JSON.stringify({
    sourceCommit: commit,
    sourceSha256: expectedSourceHash,
    songs: source.length,
    chordMappings: chords.entries.length,
    assertions:
      "exact upstream order, variant IDs, titles, verses, lyrics, MIDI/PDF paths, chord references, metadata projection",
  }),
);
