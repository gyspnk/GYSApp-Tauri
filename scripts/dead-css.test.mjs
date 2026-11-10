import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classesInCss,
  deadClasses,
  dynamicPrefixes,
  mentionsIn,
} from "./dead-css.mjs";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("classesInCss reads selectors and ignores comments and sizes", () => {
  const css = `
    /* .ghost-in-a-comment { color: red } */
    .card > .card-title { margin: 0 }
    .5rem { color: blue }
    .card:has(.is-open) { padding: 1px }
    @media (max-width: 600px) { .card { padding: 0 } }
  `;
  assert.deepEqual([...classesInCss(css)].sort(), [
    "card",
    "card-title",
    "is-open",
  ]);
});

test("mentionsIn joins every file so a class can match anywhere", () => {
  assert.equal(
    mentionsIn([{ text: 'className="card"' }, { text: '"card-title"' }]),
    'className="card"\n"card-title"',
  );
});

test("deadClasses flags selectors no source mentions", async () => {
  const root = await mkdtemp(join(tmpdir(), "dead-css-"));
  await mkdir(join(root, "src"));
  await writeFile(
    join(root, "src", "app.css"),
    ".used { color: red }\n.orphan { color: blue }\n",
  );
  await writeFile(join(root, "src", "app.tsx"), 'const x = "used";\n');
  const dead = await deadClasses(root);
  assert.deepEqual(dead, [{ name: "orphan", files: ["src/app.css"] }]);
});

test("deadClasses ignores docs and build output", async () => {
  const root = await mkdtemp(join(tmpdir(), "dead-css-"));
  await mkdir(join(root, "docs"));
  await mkdir(join(root, "dist"));
  await writeFile(
    join(root, "app.css"),
    ".quoted { color: red }\n.shipped { color: blue }\n",
  );
  await writeFile(join(root, "docs", "notes.md"), "we used .quoted once");
  await writeFile(join(root, "dist", "bundle.js"), '"quoted"');
  const dead = await deadClasses(root);
  assert.deepEqual(
    dead.map((entry) => entry.name),
    ["quoted", "shipped"],
  );
});

test("keeps classes a template literal can still complete", () => {
  const prefixes = dynamicPrefixes([
    { text: "className={`highlight-dot is-${color}`}" },
    { text: "`bible-address-field is-${field}`" },
  ]);
  assert.deepEqual([...prefixes].sort(), ["is-"]);
  const names = ["is-blue", "is-dragging", "reader-toolbar"];
  assert.deepEqual(
    names.filter((name) =>
      [...prefixes].some((prefix) => name.startsWith(prefix)),
    ),
    ["is-blue", "is-dragging"],
  );
});
