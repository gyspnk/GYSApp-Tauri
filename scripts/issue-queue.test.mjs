import assert from "node:assert/strict";
import { test } from "node:test";
import { formatQueue, labelRank, parseIssues, queue } from "./issue-queue.mjs";

test("labels decide the rank: a defect always outranks a release", () => {
  assert.equal(labelRank(["release"]), 2);
  assert.equal(labelRank(["release", "bug"]), 0);
  assert.equal(labelRank([]), 4);
  assert.equal(labelRank(["blocked"]), 3);
});

test("parseIssues accepts label objects and bare strings", () => {
  const rows = parseIssues([
    { number: 12, title: "Panel", labels: [{ name: "harness" }] },
    { number: 15, title: "Suara", labels: ["blocked", "data"] },
  ]);
  assert.deepEqual(rows[0].labels, ["harness"]);
  assert.deepEqual(rows[1].labels, ["blocked", "data"]);
});

test("queue sorts by label rank, then oldest update, then number", () => {
  const rows = queue([
    {
      number: 14,
      title: "Release",
      labels: ["release"],
      updatedAt: "2026-11-11T17:00:00Z",
    },
    {
      number: 12,
      title: "Panel",
      labels: ["harness"],
      updatedAt: "2026-11-11T15:00:00Z",
    },
    {
      number: 9,
      title: "Older defect",
      labels: ["bug"],
      updatedAt: "2026-11-11T09:00:00Z",
    },
    {
      number: 7,
      title: "Newer defect",
      labels: ["bug"],
      updatedAt: "2026-11-11T10:00:00Z",
    },
  ]);
  assert.deepEqual(
    rows.map((row) => row.number),
    [9, 7, 12, 14],
  );
});

test("formatQueue prints the position, number, title and labels", () => {
  const text = formatQueue([
    { number: 9, title: "Older defect", labels: ["bug"] },
    { number: 12, title: "Panel", labels: [] },
  ]);
  assert.equal(text, "1. #9 Older defect [bug]\n2. #12 Panel");
});
