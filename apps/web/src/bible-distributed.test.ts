import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { describe, expect, it } from "vitest";
import { loadBibleReaderPack } from "./bible-distributed.js";
import { resolveSqlWasmUrl } from "./bible-sql-runtime.js";

async function fixtureDatabase(): Promise<Uint8Array> {
  const SQL = await initSqlJs({
    locateFile: () => resolveSqlWasmUrl(wasmUrl, "test"),
  });
  const database = new SQL.Database();
  database.run(
    "CREATE TABLE book (id INTEGER, bs TEXT, bl TEXT, c INTEGER);" +
      "CREATE TABLE bible (b INTEGER, c INTEGER, v INTEGER, t TEXT);" +
      "INSERT INTO book VALUES (1, 'Gen', 'Genesis', 50);" +
      "INSERT INTO bible VALUES (1, 1, 1, 'In the beginning');",
  );
  return new Uint8Array(database.export());
}

describe("distributed Bible reader", () => {
  it("projects an installed SQLite Bible into the browser reader pack", async () => {
    const bytes = await fixtureDatabase();
    const pack = await loadBibleReaderPack("b_kjv", {
      getBytes: async (code) => (code === "b_kjv" ? bytes : undefined),
      getRecord: async () => ({ releaseTag: "bibles-2026.05.21" }),
    });

    expect(pack).toMatchObject({
      version: 1,
      translation: "KJV",
      source: "ThenGB/GYSApp-Data@bibles-2026.05.21",
    });
    expect(pack.books).toEqual([
      { id: 1, short: "Gen", name: "Genesis", chapters: 50 },
    ]);
    expect(pack.verses).toEqual([
      {
        id: "1:1:1",
        book: "1",
        bookOrder: 1,
        chapter: 1,
        verse: 1,
        text: "In the beginning",
      },
    ]);
  });

  it("fails clearly when an optional Bible has not been installed", async () => {
    await expect(
      loadBibleReaderPack("b_cuv", {
        getBytes: async () => undefined,
      }),
    ).rejects.toThrow("Bible asset is not installed: b_cuv");
  });
});
