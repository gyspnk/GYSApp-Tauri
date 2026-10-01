import { format } from "prettier";
import { readFile, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";

const source = JSON.parse(
  await readFile("packages/contracts/generated/hymn-catalog.json", "utf8"),
);
const metadata = {
  ...source,
  items: source.items.map(
    ({ lyrics: _lyrics, verses: _verses, ...item }) => item,
  ),
};
const path = "apps/web/public/offline/hymn-metadata.json";
if (process.argv.includes("--check")) {
  const actual = JSON.parse(await readFile(path, "utf8"));
  if (!isDeepStrictEqual(actual, metadata))
    throw new Error("Hymn metadata differs from the pinned lyric corpus");
} else {
  await writeFile(
    path,
    await format(JSON.stringify(metadata), { parser: "json" }),
  );
}
console.log(
  `Verified ${metadata.items.length} metadata entries at ${source.sourceCommit}`,
);
