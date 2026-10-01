import { parseCatalog, parseHymnMetadata } from "./kidung-shared.js";

export function createHymnPayloadLoader<T>(
  url: string,
  parse: (value: unknown) => T,
): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    pending ??= fetch(url, { cache: "force-cache" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Offline hymn payload unavailable");
        return parse(await response.json());
      })
      .catch((error) => {
        pending = undefined;
        throw error;
      });
    return pending;
  };
}

// Core content is pinned to a release; installed collections are read afresh.
export const loadCoreHymns = createHymnPayloadLoader(
  `${import.meta.env.BASE_URL}offline/hymn-catalog.json`,
  parseCatalog,
);
export const loadCoreHymnMetadata = createHymnPayloadLoader(
  `${import.meta.env.BASE_URL}offline/hymn-metadata.json`,
  parseHymnMetadata,
);
