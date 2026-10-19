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

export function createBundledBibleLoader(
  url: string,
): () => Promise<BibleReaderPack> {
  let pending: Promise<BibleReaderPack> | undefined;
  return () => {
    pending ??= fetch(url, { cache: "force-cache" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`TB reader pack failed: ${response.status}`);
        return parseBundledPack(await response.json());
      })
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
