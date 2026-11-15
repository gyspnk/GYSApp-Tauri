#!/usr/bin/env node
/**
 * Name the tests a local Playwright run left failing, from its own artifacts.
 *
 * A hosted run has `pnpm verify --explain <id>`; a local run only leaves
 * `apps/web/test-results/**\/error-context.md` behind, and reading those by hand
 * is the same work every time. This prints the same summary — test name plus its
 * first error line — so a local red run is one command too.
 *
 * Exit codes: 0 nothing failed, 1 at least one failure bundle was read.
 */
import {
  discoverErrorContexts,
  summarizeErrorContexts,
} from "./test-loop-core.mjs";

const DIRECTORY = "apps/web/test-results";

const files = discoverErrorContexts(DIRECTORY, { depth: 2 });
if (files.length === 0) {
  console.log(`no failure bundles under ${DIRECTORY}`);
  process.exit(0);
}

const rows = summarizeErrorContexts(files);
for (const { name, error } of rows) {
  console.log(`✗ ${name}`);
  if (error) console.log(`  ${error}`);
}
console.log(
  `${rows.length} failing test${rows.length === 1 ? "" : "s"} under ${DIRECTORY}`,
);
process.exit(1);
