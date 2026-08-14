import {
  UpstreamMusicLockSchema,
  type UpstreamMusicItem,
  type UpstreamMusicLock,
} from "@gys/contracts";

const RAW_ROOT = "https://raw.githubusercontent.com/gyspnk/gyschordweb";
const CACHE_NAME = "gys-music-assets-v1";
let lockPromise: Promise<UpstreamMusicLock> | undefined;
const inFlight = new Map<string, Promise<Uint8Array>>();

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function assetUrl(
  ref: Pick<UpstreamMusicItem, "path" | "sha256">,
  lock: UpstreamMusicLock,
): string {
  const path = ref.path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${RAW_ROOT}/${encodeURIComponent(lock.sourceCommit)}/docs/${path}`;
}

export async function loadMusicLock(): Promise<UpstreamMusicLock> {
  lockPromise ??= fetch(`${import.meta.env.BASE_URL}offline/music-lock.json`, {
    cache: "force-cache",
  }).then(async (response) => {
    if (!response.ok) throw new Error("Music lock unavailable");
    return UpstreamMusicLockSchema.parse(await response.json());
  });
  return lockPromise;
}

function localUrl(ref: Pick<UpstreamMusicItem, "path">): string {
  return new URL(
    ref.path.replace(/^\//, ""),
    window.location.origin + import.meta.env.BASE_URL,
  ).toString();
}

async function readAndVerify(
  response: Response,
  ref: UpstreamMusicItem,
): Promise<Uint8Array> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (ref.size && bytes.byteLength !== ref.size)
    throw new Error(`Asset size mismatch for ${ref.id}`);
  if ((await sha256(bytes)).toLowerCase() !== ref.sha256.toLowerCase())
    throw new Error(`Asset integrity mismatch for ${ref.id}`);
  return bytes;
}

async function cachedResponse(
  url: string,
  ref: UpstreamMusicItem,
): Promise<Uint8Array | undefined> {
  if (!("caches" in window)) return undefined;
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(url);
  if (!response) return undefined;
  try {
    return await readAndVerify(response, ref);
  } catch {
    await cache.delete(url);
    return undefined;
  }
}

async function networkResponse(
  url: string,
  ref: UpstreamMusicItem,
): Promise<Uint8Array> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Asset request failed: ${response.status}`);
  const bytes = await readAndVerify(response, ref);
  if ("caches" in window) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      url,
      new Response(bytes.slice().buffer as ArrayBuffer, {
        headers: {
          "content-type":
            response.headers.get("content-type") ?? "application/octet-stream",
        },
      }),
    );
  }
  return bytes;
}

export async function loadMusicAsset(
  ref: UpstreamMusicItem,
): Promise<Uint8Array> {
  const existing = inFlight.get(ref.sha256);
  if (existing) return existing;
  const request = (async () => {
    const local = localUrl(ref);
    try {
      const response = await fetch(local, { cache: "force-cache" });
      if (response.ok) return await readAndVerify(response, ref);
    } catch {
      // The checked-in pack contains only a small seed set; remote is expected.
    }
    const remote = assetUrl(ref, await loadMusicLock());
    return (await cachedResponse(remote, ref)) ?? networkResponse(remote, ref);
  })();
  inFlight.set(ref.sha256, request);
  try {
    return await request;
  } finally {
    inFlight.delete(ref.sha256);
  }
}

export function downloadMusicAsset(
  ref: Pick<UpstreamMusicItem, "path" | "id">,
  bytes: Uint8Array,
): void {
  const extension = ref.path.split(".").pop() ?? "bin";
  const url = URL.createObjectURL(
    new Blob([bytes.slice().buffer as ArrayBuffer], {
      type:
        extension === "pdf" ? "application/pdf" : "application/octet-stream",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  const safeId =
    ref.id
      .split("/")
      .pop()
      ?.replace(/\.[^.]+$/, "") ?? "gys-asset";
  anchor.download = `${safeId}.${extension}`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
