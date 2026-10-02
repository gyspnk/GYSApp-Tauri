import type { HymnCatalogEntry } from "@gys/contracts";
import { loadCoreHymns } from "./hymn-payloads.js";
import { loadInstalledDistributedHymnCatalog } from "./distributed-hymnals.js";
import { getDistributedAssetManager } from "./distributed-asset-manager.js";

export async function loadHymnSearchCorpus(): Promise<HymnCatalogEntry[]> {
  const [items, installed] = await Promise.all([
    loadCoreHymns(),
    loadInstalledDistributedHymnCatalog(
      getDistributedAssetManager().getStore(),
    ).catch(() => []),
  ]);
  return [...items, ...installed];
}
