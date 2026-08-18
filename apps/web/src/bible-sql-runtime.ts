import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { BibleReaderPackSchema, type BibleReaderPack } from "@gys/contracts";
import { bibleTranslationCode } from "./bible-distributed.js";

type SqlQueryResult = {
  values: unknown[][];
};

function sqlWasmUrl(): string {
  if (import.meta.env.MODE !== "test") return wasmUrl;
  return decodeURIComponent(wasmUrl).replace(/^[/\\]@fs[/\\]/, "");
}

function firstResult(
  database: { exec(query: string): SqlQueryResult[] },
  query: string,
): unknown[][] {
  return database.exec(query)[0]?.values ?? [];
}

export async function projectSqliteBibleAsync(
  code: string,
  bytes: Uint8Array,
  source: string,
): Promise<BibleReaderPack> {
  const SQL = await initSqlJs({ locateFile: sqlWasmUrl });
  const database = new SQL.Database(bytes);
  try {
    const books = firstResult(
      database,
      "select id, bs, bl, c from book order by id",
    ).map(([id, short, name, chapters]) => ({
      id: Number(id),
      short: String(short),
      name: String(name),
      chapters: Number(chapters),
    }));
    const verses = firstResult(
      database,
      "select b, c, v, t from bible order by b, c, v",
    ).map(([book, chapter, verse, text]) => ({
      id: `${Number(book)}:${Number(chapter)}:${Number(verse)}`,
      book: String(book),
      bookOrder: Number(book),
      chapter: Number(chapter),
      verse: Number(verse),
      text: String(text),
    }));
    return BibleReaderPackSchema.parse({
      version: 1,
      translation: bibleTranslationCode(code),
      source,
      books,
      verses,
    });
  } finally {
    database.close();
  }
}
