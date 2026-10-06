import { BibleReaderPackSchema, type BibleReaderPack } from "@gys/contracts";

/**
 * The bundled TB pack is immutable for the lifetime of this build. Share its
 * request, validation and parsed objects across readers and global search.
 * Consumers cancel their own subscription, never another reader's request.
 */
export function createBundledBibleLoader(
  url: string,
): () => Promise<BibleReaderPack> {
  let pending: Promise<BibleReaderPack> | undefined;
  return () => {
    pending ??= fetch(url, { cache: "force-cache" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`TB reader pack failed: ${response.status}`);
        const json: unknown = await response.json();
        const parsed = BibleReaderPackSchema.safeParse(json);
        if (!parsed.success) throw new Error("TB reader pack is invalid");
        return parsed.data;
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
