import test from "node:test";
import assert from "node:assert/strict";
import { staticEntryFiles } from "./bundle-graph.mjs";

test("counts transitive static chunks once and excludes lazy routes", () => {
  const files = staticEntryFiles({
    "index.html": {
      file: "assets/index.js",
      isEntry: true,
      imports: ["react", "shared"],
      dynamicImports: ["pdf"],
    },
    react: { file: "assets/react.js" },
    shared: { file: "assets/shared.js", imports: ["react"] },
    pdf: { file: "assets/pdf.js", imports: ["pdf-worker"] },
    "pdf-worker": { file: "assets/pdf-worker.mjs" },
  });
  assert.deepEqual([...files].sort(), [
    "assets/index.js",
    "assets/react.js",
    "assets/shared.js",
  ]);
});

test("handles cycles and counts shared chunks across entrypoints only once", () => {
  const files = staticEntryFiles({
    first: { file: "assets/first.js", isEntry: true, imports: ["shared"] },
    second: { file: "assets/second.js", isEntry: true, imports: ["shared"] },
    shared: { file: "assets/shared.js", imports: ["first"] },
  });
  assert.equal(files.size, 3);
});

test("fails closed when the build graph is incomplete", () => {
  assert.throws(() => staticEntryFiles({}), /no entrypoint/);
  assert.throws(
    () =>
      staticEntryFiles({
        entry: { file: "assets/index.js", isEntry: true, imports: ["missing"] },
      }),
    /Unresolved.*missing/,
  );
});
