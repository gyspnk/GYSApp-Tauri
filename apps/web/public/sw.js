const CACHE = "gysapp-shell-v16";
const REMOTE_MEDIA_CACHE = "gysapp-remote-media-v1";
const APP_CACHE_PREFIXES = ["gys-", "gysapp-", "gys-midi-"];
const pendingCacheWrites = new Set();
let cacheWritesPaused = false;
// Covers are useful offline, but the service worker must not turn a long
// browsing session into an unbounded disk cache. The verified asset manager
// remains the source for pinned downloads.
const MAX_REMOTE_MEDIA_ENTRIES = 96;
const BASE = self.location.pathname.replace(/sw\.js$/, "");
const withBase = (path) => `${BASE}${path}`;
const CORE = [
  "",
  "index.html",
  "manifest.webmanifest",
  "offline/bible/tb-reader.json",
  "offline/bible/manifest.json",
  "offline/hymn-catalog.json",
  "offline/distributed-assets.json",
  "offline/music-lock.json",
  "offline/faith.json",
  "offline/sauh.json",
  "offline/suara-sejati.json",
  "offline/literature.json",
  "offline/asset-manifest.json",
  "offline/pack-manifest.json",
  "offline/fork-hymnal-manifest.json",
].map(withBase);
// The synthesizer runtime is warmed after the shell is ready. SoundFonts remain
// explicit verified downloads managed outside the service-worker core.
const OPTIONAL = [
  "vendor/midi-render-worker.js",
  "vendor/js-synthesizer/js-synthesizer.min.js",
  "vendor/js-synthesizer/libfluidsynth-2.4.6.js",
].map(withBase);

function isAppCache(name) {
  return APP_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function trackCacheWrite(task) {
  const tracked = Promise.resolve(task).finally(() =>
    pendingCacheWrites.delete(tracked),
  );
  pendingCacheWrites.add(tracked);
  return tracked;
}

function putCached(cache, request, response) {
  if (cacheWritesPaused) return Promise.resolve();
  return trackCacheWrite(cache.put(request, response));
}

function putNamedCached(cacheName, request, response) {
  if (cacheWritesPaused) return Promise.resolve();
  return trackCacheWrite(
    caches.open(cacheName).then((cache) => cache.put(request, response)),
  );
}

async function waitForCacheWrites() {
  while (pendingCacheWrites.size) {
    await Promise.allSettled([...pendingCacheWrites]);
  }
}

async function clearApplicationCaches() {
  cacheWritesPaused = true;
  await waitForCacheWrites();
  const names = await caches.keys();
  await Promise.all(
    names.filter(isAppCache).map((name) => caches.delete(name)),
  );
  await waitForCacheWrites();
}

async function cacheOptional() {
  if (cacheWritesPaused) return;
  const cache = await caches.open(CACHE);
  await Promise.allSettled(
    OPTIONAL.map(async (url) => {
      if (await cache.match(url)) return;
      const response = await fetch(url, { cache: "no-cache" });
      if (response.ok) await putCached(cache, url, response.clone());
    }),
  );
}

async function pruneRemoteMediaCache(cache) {
  const keys = await cache.keys();
  const stale = keys.slice(
    0,
    Math.max(0, keys.length - MAX_REMOTE_MEDIA_ENTRIES),
  );
  await Promise.allSettled(stale.map((request) => cache.delete(request)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // A single missing optional/core URL must not invalidate the whole shell.
      await Promise.allSettled(
        CORE.map(async (url) => {
          const response = await fetch(url, { cache: "no-cache" });
          if (response.ok) await putCached(cache, url, response.clone());
        }),
      );
      const indexResponse = await fetch(withBase("index.html"), {
        cache: "no-cache",
      });
      if (indexResponse.ok) {
        const html = await indexResponse.text();
        const assets = [
          ...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g),
        ].map((match) => new URL(match[1], self.location.origin).href);
        await Promise.allSettled(
          assets.map(async (url) => {
            const response = await fetch(url, { cache: "no-cache" });
            if (response.ok) await putCached(cache, url, response.clone());
          }),
        );
      }
    }),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("gysapp-shell-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() =>
        caches
          .open(REMOTE_MEDIA_CACHE)
          .then((cache) => pruneRemoteMediaCache(cache)),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "gys-cache-optional")
    event.waitUntil(cacheOptional());
  if (event.data?.type === "gys-clear-cache") {
    const reply = event.ports?.[0];
    event.waitUntil(
      clearApplicationCaches().finally(() =>
        reply?.postMessage({ type: "gys-clear-cache-done" }),
      ),
    );
  }
});

async function fetchAndCacheShell(request, waitUntil) {
  const response = await fetch(request, { cache: "no-cache" });
  if (response.ok) {
    const copy = response.clone();
    const write = putNamedCached(CACHE, request, copy);
    waitUntil?.(write.catch(() => undefined));
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    // Only cache media from the verified TJC source. This keeps real
    // literature/Sauh/Suara covers available after the first online visit
    // without turning the service worker into an arbitrary cross-origin
    // proxy.
    const isTjcMedia =
      requestUrl.hostname === "tjc.org" &&
      /\.(?:avif|gif|jpe?g|png|webp)(?:$|\?)/i.test(requestUrl.pathname);
    if (!isTjcMedia) return;
    if (cacheWritesPaused) return;
    event.respondWith(
      caches.open(REMOTE_MEDIA_CACHE).then((cache) =>
        cache.match(event.request).then(async (cached) => {
          if (cached) {
            await pruneRemoteMediaCache(cache);
            return cached;
          }
          const response = await fetch(event.request);
          if (response.ok || response.type === "opaque") {
            await putCached(cache, event.request, response.clone());
            await pruneRemoteMediaCache(cache);
          }
          return response;
        }),
      ),
    );
    return;
  }

  const isNavigation =
    event.request.mode === "navigate" ||
    requestUrl.pathname.endsWith("/index.html");
  if (isNavigation) {
    event.respondWith(
      fetchAndCacheShell(event.request, event.waitUntil).catch(() =>
        caches.match(withBase("index.html")),
      ),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ??
        fetch(event.request)
          .then((response) => {
            if (!response.ok) return response;
            const copy = response.clone();
            event.waitUntil(
              putNamedCached(CACHE, event.request, copy).catch(() => undefined),
            );
            return response;
          })
          .catch(() => caches.match(withBase("index.html"))),
    ),
  );
});
