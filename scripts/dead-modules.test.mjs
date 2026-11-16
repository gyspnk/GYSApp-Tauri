import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  isEntry,
  moduleSpecifiers,
  resolveCandidates,
  unreferencedModules,
} from "./dead-modules.mjs";

function tree(files) {
  const root = mkdtempSync(path.join(tmpdir(), "dead-modules-"));
  for (const [name, text] of Object.entries(files)) {
    const full = path.join(root, name);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  return root;
}

test("moduleSpecifiers finds static, dynamic and worker references", () => {
  const text = [
    'import { a } from "./alpha.js";',
    'import "./beta.css";',
    'const lazy = () => import("./gamma.js");',
    'const worker = new Worker(new URL("./delta.ts", import.meta.url));',
    'import { z } from "zod";',
  ].join("\n");
  assert.deepEqual(moduleSpecifiers(text), [
    "./alpha.js",
    "./beta.css",
    "./gamma.js",
    "zod",
    "./delta.ts",
  ]);
});

test("resolveCandidates maps a .js specifier onto the .ts source beside it", () => {
  const root = tree({ "src/alpha.ts": "export const a = 1;\n" });
  assert.deepEqual(
    resolveCandidates(path.join(root, "src/beta.ts"), "./alpha.js"),
    [path.join(root, "src/alpha.ts")],
  );
});

test("resolveCandidates maps a directory onto its index file", () => {
  const root = tree({ "src/lib/index.ts": "export const b = 2;\n" });
  assert.deepEqual(
    resolveCandidates(path.join(root, "src/beta.ts"), "./lib/index.js"),
    [path.join(root, "src/lib/index.ts")],
  );
});

test("resolveCandidates ignores package imports", () => {
  assert.deepEqual(resolveCandidates("/tmp/src/beta.ts", "react"), []);
});

test("unreferencedModules reports a module nothing imports", () => {
  const root = tree({
    "src/main.tsx": 'import { used } from "./used.js";\n',
    "src/used.ts": "export const used = 1;\n",
    "src/forgotten.ts": "export const forgotten = 1;\n",
  });
  const files = ["main.tsx", "used.ts", "forgotten.ts"].map((name) =>
    path.join(root, "src", name),
  );
  assert.deepEqual(unreferencedModules(files), [
    path.join(root, "src/forgotten.ts"),
  ]);
});

test("unreferencedModules keeps a module reached only by a dynamic import", () => {
  const root = tree({
    "src/main.tsx": 'void import("./lazy.js");\n',
    "src/lazy.ts": "export const lazy = 1;\n",
  });
  const files = ["main.tsx", "lazy.ts"].map((name) =>
    path.join(root, "src", name),
  );
  assert.deepEqual(unreferencedModules(files), []);
});

test("isEntry treats the bundler entry, tests and non-src files as wired up", () => {
  assert.equal(isEntry("/repo/apps/web/src/main.tsx"), true);
  assert.equal(isEntry("/repo/apps/web/src/thing.test.ts"), true);
  assert.equal(isEntry("/repo/apps/web/e2e/thing.ts"), true);
  assert.equal(isEntry("/repo/apps/web/src/thing.ts"), false);
});
