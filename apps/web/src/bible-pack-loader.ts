import type { BibleReaderPack } from "@gys/contracts";

/**
 * The bundled TB pack is immutable for the lifetime of this build. Share its
 * request, validation and parsed objects across readers and global search.
 * Consumers cancel their own subscription, never another reader's request.
 */

/** A build artifact is trusted in production; the deep schema pass costs more
 * than JSON.parse itself (7.5 MB / 31k verses) and blocks the main thread. The
 * guard below still rejects structurally broken packs, and development keeps
 * the full schema check. */
function isBundledPack(value: unknown): value is BibleReaderPack {
  if (!value || typeof value !== "object") return false;
  const pack = value as Partial<BibleReaderPack>;
  if (pack.version !== 1) return false;
  if (!Array.isArray(pack.books) || !Array.isArray(pack.verses)) return false;
  if (!pack.books.length || !pack.verses.length) return false;
  const first = pack.verses[0];
  return Boolean(
    first && typeof first.id === "string" && typeof first.text === "string",
  );
}

async function parseBundledPack(json: unknown): Promise<BibleReaderPack> {
  if (import.meta.env.DEV) {
    const { BibleReaderPackSchema } = await import("@gys/contracts");
    const parsed = BibleReaderPackSchema.safeParse(json);
    if (!parsed.success) throw new Error("TB reader pack is invalid");
    return parsed.data;
  }
  if (!isBundledPack(json)) throw new Error("TB reader pack is invalid");
  return json;
}

/**
 * GitHub Pages serves the 7,6 MB pack without content-encoding. The build
 * writes a deterministic `.json.gz` sibling (~1,7 MB); inflate it in the
 * browser and fall back to the plain file when the API or the request is
 * unavailable, so an old cached shell keeps working.
 */
async function readGzipOrJson(response: Response): Promise<unknown> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  // Some hosts answer a `.gz` request with `content-encoding: gzip`, so the
  // browser has already inflated the body and only the bytes tell the truth.
  const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!gzipped) return JSON.parse(new TextDecoder().decode(bytes));
  const inflated = new Response(bytes).body!.pipeThrough(
    new DecompressionStream("gzip"),
  );
  return await new Response(inflated).json();
}

type PackHook = { __gysBiblePack?: Promise<Response | undefined> };

async function fetchGzip(url: string): Promise<Response> {
  // The prerendered Bible shells start this request during parse and hand the
  // promise over, so the 1,7 MB transfer overlaps the entry chunk.
  const hook = (globalThis as PackHook).__gysBiblePack;
  if (hook) {
    const early = await hook;
    if (early?.ok) return early;
  }
  return fetch(`${url}.gz`, { cache: "force-cache" });
}

async function readPackJson(url: string): Promise<unknown> {
  if (typeof DecompressionStream !== "undefined") {
    try {
      const response = await fetchGzip(url);
      if (response.ok) return await readGzipOrJson(response);
    } catch {
      /* fall through to the plain pack */
    }
  }
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok)
    throw new Error(`TB reader pack failed: ${response.status}`);
  return response.json();
}

export function createBundledBibleLoader(
  url: string,
): () => Promise<BibleReaderPack> {
  let pending: Promise<BibleReaderPack> | undefined;
  return () => {
    pending ??= readPackJson(url)
      .then(parseBundledPack)
      .catch((error: unknown) => {
        pending = undefined;
        throw error;
      });
    return pending;
  };
}

const loadPack = createBundledBibleLoader(
  `${import.meta.env.BASE_URL}offline/bible/tb-reader.json`,
);

let cachedPack: BibleReaderPack | undefined;
export const getCachedBundledBiblePack = () => cachedPack;
export const loadBundledBiblePack = () =>
  loadPack().then((pack) => (cachedPack = pack));

/**
 * Per-book packs written by `scripts/split-bible-pack.mjs`. The reader will
 * load the book it shows instead of the 1,7 MB shelf; the full pack stays as
 * the fallback until the reader is switched over.
 */
export type BibleBookPack = {
  version: number;
  translation: string;
  book: { id: string | number; name?: string };
  verses: BibleReaderPack["verses"];
  pericopes?: NonNullable<BibleReaderPack["pericopes"]>;
};

export function bibleBookPackUrl(
  bookId: string,
  base = import.meta.env.BASE_URL,
): string {
  return `${base}offline/bible/books/${encodeURIComponent(bookId)}.json.gz`;
}

function isBookPack(value: unknown): value is BibleBookPack {
  if (!value || typeof value !== "object") return false;
  const pack = value as Partial<BibleBookPack>;
  return (
    typeof pack.version === "number" &&
    Boolean(pack.book && typeof pack.book === "object") &&
    Array.isArray(pack.verses) &&
    pack.verses.length > 0 &&
    typeof pack.verses[0]?.id === "string" &&
    typeof pack.verses[0]?.text === "string"
  );
}

const bookPacks = new Map<string, Promise<BibleBookPack>>();

export function loadBibleBookPack(bookId: string): Promise<BibleBookPack> {
  const cached = bookPacks.get(bookId);
  if (cached) return cached;
  const pending = fetch(bibleBookPackUrl(bookId), { cache: "force-cache" })
    .then(async (response) => {
      if (!response.ok)
        throw new Error(`Bible book pack failed: ${response.status}`);
      const parsed = await readGzipOrJson(response);
      if (!isBookPack(parsed)) throw new Error("Bible book pack is invalid");
      return parsed;
    })
    .catch((error: unknown) => {
      bookPacks.delete(bookId);
      throw error;
    });
  bookPacks.set(bookId, pending);
  return pending;
}

export function clearBibleBookPacks() {
  bookPacks.clear();
}
