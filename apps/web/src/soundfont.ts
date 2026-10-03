import { getDistributedAssetManager } from "./distributed-asset-manager.js";

export const BUNDLED_SOUNDFONT = "TimGM6mb";
export const OPTIONAL_SOUNDFONT = "GeneralUser-GS";

/** Installed upgrade wins; first-time/offline playback uses the packaged bank. */
export async function loadDefaultSoundfont(
  fetcher: typeof fetch = fetch,
  optionalLoader = () =>
    getDistributedAssetManager().getStore().getBytes(OPTIONAL_SOUNDFONT),
): Promise<{ name: string; bytes: Uint8Array }> {
  const optional = await optionalLoader().catch(() => undefined);
  if (optional) return { name: OPTIONAL_SOUNDFONT, bytes: optional };
  const response = await fetcher(
    `${import.meta.env.BASE_URL}assets/soundfont/TimGM6mb.sf2`,
    { cache: "force-cache" },
  );
  if (!response.ok)
    throw new Error(`Bundled SoundFont HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.byteLength !== 5_994_284 ||
    new TextDecoder().decode(bytes.subarray(8, 12)) !== "sfbk"
  )
    throw new Error("Bundled SoundFont is incomplete");
  return { name: BUNDLED_SOUNDFONT, bytes };
}
