import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, readdir, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const sourceRepo = "gyspnk/gyschordweb";
const sourceCommit = process.env.GYSCHORDWEB_COMMIT ?? "a3d1ea7";
const generatedAt = new Date().toISOString();
const sourceRoot = process.env.GYSCHORDWEB_SNAPSHOT;

if (!sourceRoot) {
  throw new Error(
    "Set GYSCHORDWEB_SNAPSHOT to a read-only gyschordweb checkout before generating a lock.",
  );
}

try {
  await access(join(sourceRoot, ".git"));
  const head = execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  if (!head.startsWith(sourceCommit))
    throw new Error(
      `snapshot HEAD ${head} does not match required commit ${sourceCommit}`,
    );
} catch (error) {
  if (error instanceof Error && error.message.startsWith("snapshot HEAD"))
    throw error;
  // Archived immutable snapshots do not contain .git; their commit is supplied explicitly.
}

const manifest = JSON.parse(
  await readFile(join(sourceRoot, "docs", "assets-list.json"), "utf8"),
);
const items = [];
const candidates = [
  ...manifest.map(
    (entry) => `assets/pdf/${typeof entry === "string" ? entry : entry.path}`,
  ),
  ...(await readdir(join(sourceRoot, "docs", "assets", "midi"))).map(
    (name) => `assets/midi/${name}`,
  ),
  ...(await readdir(join(sourceRoot, "docs", "assets", "chord"))).map(
    (name) => `assets/chord/${name}`,
  ),
  ...(await readdir(join(sourceRoot, "docs", "assets", "soundfont"))).map(
    (name) => `assets/soundfont/${name}`,
  ),
];
for (const path of candidates) {
  // Read immutable git blobs instead of the checkout. On Windows a global
  // `core.autocrlf=true` can silently rewrite chord JSON line endings and
  // produce hashes that never match raw.githubusercontent.com.
  const bytes = (() => {
    try {
      if (!path.includes("/chord/"))
        return readFile(join(sourceRoot, "docs", path));
      execFileSync("git", ["-C", sourceRoot, "rev-parse", "--git-dir"], {
        stdio: "ignore",
      });
      return execFileSync(
        "git",
        ["-C", sourceRoot, "show", `${sourceCommit}:docs/${path}`],
        { maxBuffer: 256 * 1024 * 1024 },
      );
    } catch {
      return readFile(join(sourceRoot, "docs", path));
    }
  })();
  const resolvedBytes = bytes instanceof Promise ? await bytes : bytes;
  const kind = path.includes("/pdf/")
    ? "pdf"
    : path.includes("/midi/")
      ? "midi"
      : path.includes("/chord/")
        ? "chord"
        : "soundfont";
  items.push({
    id: path,
    kind,
    path,
    size: resolvedBytes.byteLength,
    sha256: createHash("sha256").update(resolvedBytes).digest("hex"),
  });
}

await mkdir(join("packages", "contracts", "generated"), { recursive: true });
await writeFile(
  join("packages", "contracts", "generated", "upstream-music-lock.json"),
  `${JSON.stringify({ sourceRepo, sourceCommit, generatedAt, items }, null, 2)}\n`,
  "utf8",
);
console.log(
  `Generated ${items.length} immutable music entries from ${sourceRepo}@${sourceCommit}.`,
);
