import assert from "node:assert/strict";
import test from "node:test";
import { pruneCss, selectorParts, shrinkPart } from "./prune-dead-css.mjs";

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

test("shrinks a functional pseudo-class argument list", () => {
  const dead = new Set(["ghost", "wraith"]);
  assert.equal(shrinkPart(".live:is(.ghost, .other)", dead), ".live.other");
  assert.equal(
    shrinkPart(".live :where(.wraith, .other):not(.ghost)", dead),
    ".live :where(.other)",
  );
  assert.equal(shrinkPart(".live:not(.ghost)", dead), ".live");
  assert.equal(shrinkPart(".live:has(.ghost)", dead), ".live");
});

test("drops a selector whose functional pseudo-class empties", () => {
  const dead = new Set(["ghost"]);
  assert.equal(shrinkPart(".live:is(.ghost)", dead), null);
  const css = ".live:is(.ghost) { color: red; }\n.other { color: blue; }\n";
  assert.equal(pruneCss(css, dead).trim(), ".other { color: blue; }");
});

test("recurses into nested functional pseudo-classes", () => {
  const dead = new Set(["ghost"]);
  assert.equal(
    shrinkPart(".live:is(.other, :where(.ghost, .third))", dead),
    ".live:is(.other, :where(.third))",
  );
});
