import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

import { orphanSelectors, queriedClasses } from "./orphan-selectors.mjs";

async function fixture(tree) {
  const root = await mkdtemp(join(tmpdir(), "orphan-selectors-"));
  for (const [path, content] of Object.entries(tree)) {
    const full = join(root, path);
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, content);
  }
  return root;
}

test("reads classes out of literal selector calls only", () => {
  const classes = queriedClasses(`
    page.locator(".kept-one");
    page.locator('section > .kept-two, .kept-three');
    page.locator(\`#id-only\`);
    page.getByRole("button", { name: "Simpan" });
  `);
  assert.deepEqual(classes.sort(), ["kept-one", "kept-three", "kept-two"]);
});

test("reports a class the app no longer declares", async () => {
  const root = await fixture({
    "apps/web/src/app.tsx": `export const A = () => <div className="live-class" />;`,
    "apps/web/src/app.css": `.live-class { color: red; }`,
    "apps/web/e2e/contract.spec.ts": `await page.locator(".gone-class").click();\nawait page.locator(".live-class").click();`,
  });
  try {
    const offenders = await orphanSelectors(root);
    assert.deepEqual(offenders, [
      { file: "apps/web/e2e/contract.spec.ts", classes: ["gone-class"] },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("accepts a class the app writes at runtime", async () => {
  const root = await fixture({
    "apps/web/src/app.ts": `element.classList.add("state-class");`,
    "apps/web/e2e/contract.spec.ts": `await page.locator(".state-class").waitFor();`,
  });
  try {
    assert.deepEqual(await orphanSelectors(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ignores absence assertions and attribute fallbacks", async () => {
  const root = await fixture({
    "apps/web/src/app.tsx": `export const A = () => <p />;`,
    "apps/web/src/app.css": `p { margin: 0; }`,
    "apps/web/e2e/contract.spec.ts": [
      `await expect(page.locator(".retired")).toHaveCount(`,
      `  0,`,
      `);`,
      `await page.locator('.retired-two, button[aria-label*="PDF"]').first().click();`,
    ].join("\n"),
  });
  try {
    assert.deepEqual(await orphanSelectors(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
