import {
  ChordRepository,
  type ChordFetchResult,
  type ChordUpstream,
} from "@gys/domain";
import type { ChordRef, ChordManifestV1 } from "@gys/contracts";
import { BrowserChordCache } from "./chord-cache.js";
import { createBrowserPlatformServices } from "./platform.js";

const RAW_ROOT = "https://raw.githubusercontent.com/gyspnk/gyschordweb";

export function createBrowserChordRepository(): ChordRepository {
  const upstream: ChordUpstream = {
    async getManifest(etag, signal) {
      const response = await fetch(
        "/api/v1/chords/manifest",
        signal
          ? {
              signal,
              ...(etag ? { headers: { "if-none-match": etag } } : {}),
            }
          : etag
            ? { headers: { "if-none-match": etag } }
            : {},
      );
      if (response.status === 304 && etag)
        return {
          notModified: true,
          etag,
        };
      if (!response.ok)
        throw new Error(`manifest request failed: ${response.status}`);
      const nextEtag = response.headers.get("etag");
      return {
        manifest: (await response.json()) as ChordManifestV1,
        ...(nextEtag ? { etag: nextEtag } : {}),
      };
    },
    async fetchChord(ref: ChordRef, signal): Promise<ChordFetchResult> {
      const response = await fetch(
        `${RAW_ROOT}/${ref.sourceCommit}/docs/${ref.path}`,
        signal ? { signal, cache: "force-cache" } : { cache: "force-cache" },
      );
      if (!response.ok)
        throw new Error(`chord request failed: ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      return {
        bytes,
        document: JSON.parse(new TextDecoder().decode(bytes)) as unknown,
      };
    },
  };
  return new ChordRepository(
    upstream,
    new BrowserChordCache(createBrowserPlatformServices()),
  );
}
