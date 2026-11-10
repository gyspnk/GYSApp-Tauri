import assert from "node:assert/strict";
import test from "node:test";
import { pruneCss } from "./prune-dead-css.mjs";

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

test("cuts only rules whose classes are all dead", () => {
  const out = pruneCss(CSS, new Set(["ghost"]));
  assert.match(out, /\.alive \{ color: red; \}/);
  assert.match(out, /\.alive, \.ghost \{ padding: 4px; \}/);
  assert.doesNotMatch(out, /\.ghost \{\n    display: none/);
  assert.match(out, /@keyframes pulse/);
  assert.match(out, /\.tail \{ display: block; \}/);
});

test("leaves the file untouched when nothing is dead", () => {
  assert.equal(pruneCss(CSS, new Set()), CSS);
});
