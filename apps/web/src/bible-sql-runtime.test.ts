import { describe, expect, it } from "vitest";
// @ts-expect-error Vitest uses Node file IO; application types target the browser.
import { readFileSync } from "node:fs";
import {
  projectSqliteBibleAsync,
  resolveSqlWasmUrl,
} from "./bible-sql-runtime.js";

it("bundled SQLite retains the complete reader content and references", async () => {
  const root = new URL("../public/offline/bible/", import.meta.url);
  const bytes = readFileSync(new URL("b_tb.db", root));
  const reader = JSON.parse(
    readFileSync(new URL("tb-reader.json", root), "utf8"),
  );
  const projected = await projectSqliteBibleAsync("TB", bytes, "bundled");
  expect(projected.books).toEqual(reader.books);
  expect(projected.verses).toEqual(reader.verses);
  expect(projected.books).toHaveLength(66);
  expect(projected.verses).toHaveLength(31172);
  expect(projected.pericopes).toEqual(
    reader.pericopes.map(
      ({ parallels: _, ...pericope }: { parallels?: unknown }) => pericope,
    ),
  );
  expect(projected.crossRefs).toEqual(
    Object.fromEntries(
      Object.entries(reader.crossRefs).filter(([key]) => !key.includes(":")),
    ),
  );
});

describe("SQLite WASM resolver", () => {
  it("keeps POSIX paths absolute after stripping the Vite /@fs prefix", () => {
    expect(
      resolveSqlWasmUrl(
        "/@fs/home/runner/work/GYSApp-Tauri/node_modules/sql.js/dist/sql-wasm.wasm",
        "test",
      ),
    ).toBe(
      "/home/runner/work/GYSApp-Tauri/node_modules/sql.js/dist/sql-wasm.wasm",
    );
  });

  it("also accepts Vite's prefix when it is emitted without a leading slash", () => {
    expect(
      resolveSqlWasmUrl(
        "@fs/home/runner/work/GYSApp-Tauri/node_modules/sql.js/dist/sql-wasm.wasm",
        "test",
      ),
    ).toBe(
      "/home/runner/work/GYSApp-Tauri/node_modules/sql.js/dist/sql-wasm.wasm",
    );
  });

  it("keeps Windows drive paths valid after stripping the Vite /@fs prefix", () => {
    expect(
      resolveSqlWasmUrl(
        "/@fs/C:/repo/node_modules/sql.js/dist/sql-wasm.wasm",
        "test",
      ),
    ).toBe("C:/repo/node_modules/sql.js/dist/sql-wasm.wasm");
  });

  it("leaves production asset URLs unchanged", () => {
    expect(resolveSqlWasmUrl("/assets/sql-wasm.wasm", "production")).toBe(
      "/assets/sql-wasm.wasm",
    );
  });
});
