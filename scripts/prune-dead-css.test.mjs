import assert from "node:assert/strict";
import test from "node:test";
import { pruneCss, selectorParts } from "./prune-dead-css.mjs";

const CSS = `/* .ghost-in-comment stays because comments are blanked, not parsed */
.alive { color: red; }
.ghost { margin: 0; }
@media (min-width: 600px) {
  .alive, .ghost { padding: 4px; }
  .ghost { display: none; }
}
@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }
.tail { display: block; }
`;

test("shrinks a group instead of dropping its live half", () => {
  const out = pruneCss(CSS, new Set(["ghost"]));
  assert.match(out, /\.alive \{ color: red; \}/);
  assert.match(out, /\.alive \{ padding: 4px; \}/);
  assert.doesNotMatch(out, /\.ghost \{\n    display: none/);
  assert.match(out, /@keyframes pulse/);
  assert.match(out, /\.tail \{ display: block; \}/);
});

test("leaves the file untouched when nothing is dead", () => {
  assert.equal(pruneCss(CSS, new Set()), CSS);
});

test("keeps a live part exactly as written", () => {
  const css = ".a .b, .c { color: red; }\n";
  assert.equal(pruneCss(css, new Set(["c"])), ".a .b { color: red; }\n");
});

test("does not split commas inside :is(), :where() or attribute values", () => {
  assert.deepEqual(selectorParts(':is(.a, .b) > .c, [data-x="1,2"]'), [
    ":is(.a, .b) > .c",
    ' [data-x="1,2"]',
  ]);
});

test("is idempotent", () => {
  const once = pruneCss(CSS, new Set(["ghost"]));
  assert.equal(pruneCss(once, new Set(["ghost"])), once);
});
