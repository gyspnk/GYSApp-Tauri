import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { BibleReaderPackSchema, type BibleReaderPack } from "@gys/contracts";
import { bibleTranslationCode } from "./bible-distributed.js";

type SqlQueryResult = {
  values: unknown[][];
};

/** Resolve Vite's test-only `/@fs/` URL into a real absolute filesystem path. */
export function resolveSqlWasmUrl(
  value: string,
  mode = import.meta.env.MODE,
): string {
  if (mode !== "test") return value;
  const decoded = decodeURIComponent(value);
  const prefix = decoded.match(/^[/\\]@fs[/\\](.*)$/);
  if (!prefix?.[1]) return decoded;
  const path = prefix[1];
  // Vite prefixes both POSIX and Windows absolute paths with `/@fs/`.
  // Re-add the POSIX root slash, but leave a Windows drive path unchanged.
  return /^[A-Za-z]:[/\\]/.test(path) ? path : `/${path}`;
}

function sqlWasmUrl(): string {
  return resolveSqlWasmUrl(wasmUrl);
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
