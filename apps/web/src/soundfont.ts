/**
 * The distributed asset manager owns zod schemas for the optional soundfont
 * download. Loading it inside the async paths keeps that weight out of the
 * shell's first paint (B-24).
 */
async function distributedStore() {
  const { getDistributedAssetManager } =
    await import("./distributed-asset-manager.js");
  return getDistributedAssetManager().getStore();
}

export const BUNDLED_SOUNDFONT = "TimGM6mb";
export const OPTIONAL_SOUNDFONT = "GeneralUser-GS";

export async function getActiveSoundfontName(): Promise<string> {
  return (await distributedStore()).hasCachedPayload(OPTIONAL_SOUNDFONT)
    ? OPTIONAL_SOUNDFONT
    : BUNDLED_SOUNDFONT;
}

/** Installed upgrade wins; first-time/offline playback uses the packaged bank. */
export async function loadDefaultSoundfont(
  fetcher: typeof fetch = fetch,
  optionalLoader = async () =>
    (await distributedStore()).getBytes(OPTIONAL_SOUNDFONT),
): Promise<{ name: string; bytes: Uint8Array }> {
  const optional = await optionalLoader();
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
