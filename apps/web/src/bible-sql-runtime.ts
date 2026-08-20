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
  const prefix = decoded.match(/^[/\\]?@fs[/\\](.*)$/);
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
    // Pericopes & cross-refs are optional — TB has them, some packs may not.
    let pericopes:
      | {
          id: string;
          book: string;
          chapter: number;
          verse: number;
          title: string;
        }[]
      | undefined;
    let crossRefs:
      | Record<
          string,
          {
            book: string;
            chapter: number;
            verse: number;
            endBook?: string;
            endChapter?: number;
            endVerse?: number;
          }[]
        >
      | undefined;
    try {
      const rawPericopes = firstResult(
        database,
        "select id, s, b, c, v, t from pericope order by b, c, v",
      );
      if (rawPericopes.length) {
        pericopes = rawPericopes.map(([id, , b, c, v, t]) => ({
          id: String(id),
          book: String(b),
          chapter: Number(c),
          verse: Number(v),
          title: String(t),
        }));
      }
    } catch {}
    try {
      const rawRefs = firstResult(
        database,
        "select id, sv, ev from ref order by id, sv",
      );
      if (rawRefs.length) {
        const map: NonNullable<typeof crossRefs> = {};
        for (const [id, sv, ev] of rawRefs) {
          const svNum = Number(sv);
          if (!svNum) continue;
          const b = Math.floor(svNum / 1_000_000);
          const c = Math.floor((svNum % 1_000_000) / 1000);
          const v = svNum % 1000;
          if (!b || !c || !v) continue;
          const key = String(id);
          const entry: NonNullable<typeof crossRefs>[string][number] = {
            book: String(b),
            chapter: c,
            verse: v,
          };
          const evNum = Number(ev);
          if (evNum) {
            if (evNum >= 1_000_000) {
              const eb = Math.floor(evNum / 1_000_000);
              const ec = Math.floor((evNum % 1_000_000) / 1000);
              const evv = evNum % 1000;
              if (eb !== b) entry.endBook = String(eb);
              if (ec !== c) entry.endChapter = ec;
              if (eb !== b || ec !== c || evv !== v) entry.endVerse = evv;
            } else if (evNum !== v) {
              entry.endVerse = evNum;
            }
          }
          (map[key] ??= []).push(entry);
        }
        if (Object.keys(map).length) crossRefs = map;
      }
    } catch {}
    return BibleReaderPackSchema.parse({
      version: 1,
      translation: bibleTranslationCode(code),
      source,
      books,
      verses,
      ...(pericopes ? { pericopes } : {}),
      ...(crossRefs ? { crossRefs } : {}),
    });
  } finally {
    database.close();
  }
}
