import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyDocumentation } from "./verify-documentation.mjs";

const TODAY_ISO = "2026-09-07";
const HANDOFF = "docs/plans/HANDOFF-2026-11-10.md";
const VALID_PROMPT = [
  "Lanjutkan goal aktif.",
  "Mulai dengan `pnpm check:fast`; baca docs/plans/ui-spec-loop.md.",
  "Rilis APK setiap 25 putaran mengikuti .github/release-cadence.json.",
  "Dispatch android-release.yml dengan turn berjalan.",
  "Pengecualian lokal berat memakai GYS_ALLOW_LOCAL_HEAVY=1.",
  "Versi rilis v0.1.0-preview.20261110.1 hanya label.",
  "Delegasi mengikuti docs/plans/agent-brain.md dan docs/plans/subagents.md.",
].join("\n");
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

async function handoffFileRoot(content) {
  const root = await mkdtemp(join(tmpdir(), "gys-docs-"));
  await mkdir(join(root, "docs", "plans"), { recursive: true });
  await writeFile(join(root, HANDOFF), content);
  return root;
}

async function handoffRoot(prompt, { archive = "" } = {}) {
  return handoffFileRoot(
    [
      "# Handoff fixture",
      "",
      "## 8. Arsip",
      archive,
      "",
      "## 9. Prompt handoff (tempel di sesi baru)",
      "",
      "```text",
      prompt,
      "```",
      "",
    ].join("\n"),
  );
}

const handoffFailures = (failures) =>
  failures.filter((failure) => failure.startsWith(`${HANDOFF}:`));

test("active handoff prompt requires current refs and rejects obsolete guidance", async () => {
  const failures = await verifyDocumentation(
    await handoffRoot(
      [
        "Mulai dari docs/plans/ui-spec-loop.md dan jalankan pnpm check:fast.",
        "Rilis mengikuti .github/release-cadence.json.",
        "Jangan pakai docs/plans/opendesign-ui-loop.md.",
        "Lanjut putaran 276 lewat turn=276.",
      ].join("\n"),
    ),
    { today: TODAY_ISO },
  );
  const handoff = handoffFailures(failures).join("; ");
  assert.match(handoff, /missing "docs\/plans\/agent-brain\.md"/);
  assert.match(handoff, /missing "docs\/plans\/subagents\.md"/);
  assert.match(handoff, /obsolete opendesign-ui-loop/);
  assert.match(handoff, /fixed release turn/);
});

test("active handoff rejects old all-hosted mandate and OpenDesign invitation", async () => {
  const failures = await verifyDocumentation(
    await handoffRoot(
      [
        VALID_PROMPT,
        "Semua proses (typecheck, unit, build, e2e, visual, axe, perf, soak, bundle, docs, format, screenshot)",
        "WAJIB di GitHub Actions. Lokal hanya pnpm dev dan pnpm preview.",
        "Semua pemeriksaan WAJIB di GitHub Actions; lokal hanya pnpm dev.",
        "Desain baru diambil dari artefak OpenDesign di docs/design/ atau lewat run OpenDesign.",
      ].join("\n"),
    ),
    { today: TODAY_ISO },
  );
  const handoff = handoffFailures(failures).join("; ");
  assert.equal(
    handoff.match(/obsolete all-hosted mandate/g)?.length,
    2,
    handoff,
  );
  assert.match(handoff, /obsolete OpenDesign invitation/);
});

test("fixed-turn guard catches putaran ke-276 and turn 276", async () => {
  for (const line of ["putaran ke-276", "turn 276"]) {
    const failures = await verifyDocumentation(
      await handoffRoot([VALID_PROMPT, line].join("\n")),
      { today: TODAY_ISO },
    );
    assert.ok(
      handoffFailures(failures).some((failure) =>
        failure.includes("fixed release turn"),
      ),
      `${line}: ${handoffFailures(failures).join("; ")}`,
    );
  }
});

test("active handoff prompt missing heading or empty fails clearly", async () => {
  const noHeading = await handoffFileRoot("# Handoff fixture\n");
  const noHeadingFailures = handoffFailures(
    await verifyDocumentation(noHeading, { today: TODAY_ISO }),
  );
  assert.ok(
    noHeadingFailures.some((failure) =>
      failure.includes("section 9 prompt handoff is missing"),
    ),
    noHeadingFailures.join("; "),
  );

  const empty = handoffFailures(
    await verifyDocumentation(await handoffRoot(""), { today: TODAY_ISO }),
  );
  assert.ok(
    empty.some((failure) => failure.includes("active prompt is empty")),
    empty.join("; "),
  );
});

test("active handoff prompt accepts current refs and ignores obsolete archive text", async () => {
  const failures = await verifyDocumentation(
    await handoffRoot(VALID_PROMPT, {
      archive: "Lama: docs/plans/opendesign-ui-loop.md dan putaran 251.",
    }),
    { today: TODAY_ISO },
  );
  assert.deepEqual(handoffFailures(failures), []);
});

test("active handoff prompt absence is a clear handoff failure", async () => {
  const noFence = await handoffFileRoot(
    [
      "# Handoff fixture",
      "",
      "## 9. Prompt handoff (tempel di sesi baru)",
      "",
      "Tidak ada blok teks.",
      "",
    ].join("\n"),
  );
  const noFenceFailures = handoffFailures(
    await verifyDocumentation(noFence, { today: TODAY_ISO }),
  );
  assert.ok(
    noFenceFailures.some((failure) => failure.includes("fenced text prompt")),
    noFenceFailures.join("; "),
  );

  const noFile = await mkdtemp(join(tmpdir(), "gys-docs-"));
  const noFileFailures = handoffFailures(
    await verifyDocumentation(noFile, { today: TODAY_ISO }),
  );
  assert.ok(
    noFileFailures.some((failure) => failure.includes("file is missing")),
    noFileFailures.join("; "),
  );
});

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
