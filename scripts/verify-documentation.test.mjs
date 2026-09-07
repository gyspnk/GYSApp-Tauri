import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyDocumentation } from "./verify-documentation.mjs";

const TODAY_ISO = "2026-09-07";
const isoDay = (date) => date.toISOString().slice(0, 10);
const daysBefore = (n) =>
  isoDay(new Date(new Date(`${TODAY_ISO}T00:00:00Z`).getTime() - n * 86400000));

async function mapOnlyRoot(reviewDate) {
  const root = await mkdtemp(join(tmpdir(), "gys-docs-"));
  await mkdir(join(root, "docs", "maintenance"), { recursive: true });
  await writeFile(
    join(root, "docs", "maintenance", "codebase-map.md"),
    [
      "# Codebase simplification map",
      "## Documentation and skill cadence",
      `- Last maintenance skill review: ${reviewDate}`,
      "- Skill review frontier: CF-100",
      "## Decisions so far",
      "- `2026-01-01 / CF-100`: fixture frontier.",
      "## Frontier",
      "Validation for CF-100: fixture validation.",
      "## Not yet specified",
      "",
    ].join("\n"),
  );
  return root;
}

test("living documentation contains the required architecture and release map", async () => {
  const failures = await verifyDocumentation(process.cwd());
  assert.deepEqual(failures, []);
});

test("skill review cadence allows a review 29 days old", async () => {
  const failures = await verifyDocumentation(
    await mapOnlyRoot(daysBefore(29)),
    { today: TODAY_ISO },
  );
  assert.ok(
    !failures.some((failure) => failure.includes("skill review is overdue")),
    `unexpected overdue failure: ${failures.join("; ")}`,
  );
});

test("skill review cadence flags a review 30 days old", async () => {
  const failures = await verifyDocumentation(
    await mapOnlyRoot(daysBefore(30)),
    { today: TODAY_ISO },
  );
  assert.ok(
    failures.some((failure) =>
      failure.includes("skill review is overdue (30 days old)"),
    ),
    `expected a 30-day overdue failure: ${failures.join("; ")}`,
  );
});

test("living documentation reports an overdue maintenance-skill review", async () => {
  const failures = await verifyDocumentation(process.cwd(), {
    today: "2999-01-01",
  });
  assert.ok(
    failures.some((failure) => failure.includes("skill review is overdue")),
  );
});
