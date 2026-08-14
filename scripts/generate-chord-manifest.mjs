import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";

const lock = JSON.parse(
  await readFile(
    join("packages", "contracts", "generated", "upstream-music-lock.json"),
    "utf8",
  ),
);
const entries = lock.items
  .filter((item) => item.kind === "chord")
  .map((item) => {
    const match = basename(item.path).match(/^(\d+)_/u);
    if (!match)
      throw new Error(`Chord filename has no numeric id: ${item.path}`);
    return {
      songId: `hymn-${match[1]}`,
      path: item.path,
      sourceCommit: lock.sourceCommit,
      size: item.size,
      sha256: item.sha256,
    };
  });

await mkdir(join("apps", "bff", "src"), { recursive: true });
const generated = {
  version: 1,
  sourceRepo: lock.sourceRepo,
  sourceCommit: lock.sourceCommit,
  generatedAt: lock.generatedAt,
  entries,
};
await mkdir(join("packages", "contracts", "generated"), { recursive: true });
await writeFile(
  join("packages", "contracts", "generated", "chord-manifest.json"),
  `${JSON.stringify(generated, null, 2)}\n`,
  "utf8",
);
await writeFile(
  join("apps", "bff", "src", "chord-manifest.ts"),
  `import type { ChordManifestV1 } from "@gys/contracts";\n\nexport const chordManifest: ChordManifestV1 = ${JSON.stringify(
    generated,
    null,
    2,
  )};\n`,
  "utf8",
);
console.log(`Generated ${entries.length} chord references.`);
