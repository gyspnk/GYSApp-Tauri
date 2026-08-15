const CACHE = "gysapp-shell-v10";
const REMOTE_MEDIA_CACHE = "gysapp-remote-media-v1";
const BASE = self.location.pathname.replace(/sw\.js$/, "");
const withBase = (path) => `${BASE}${path}`;
const CORE = [
  "",
  "index.html",
  "manifest.webmanifest",
  "offline/bible/tb-reader.json",
  "offline/bible/manifest.json",
  "offline/hymn-catalog.json",
  "offline/music-lock.json",
  "offline/faith.json",
  "offline/sauh.json",
  "offline/suara-sejati.json",
  "offline/literature.json",
  "offline/asset-manifest.json",
  "offline/pack-manifest.json",
  "offline/fork-hymnal-manifest.json",
].map(withBase);
// Heavy audio/WASM remains available offline, but is intentionally warmed in
// the background after the shell is ready so first paint and SW activation are
// not held hostage by a 6 MB soundfont or multi-megabyte synthesizer runtime.
const OPTIONAL = [
  "offline/soundfont/TimGM6mb.sf2",
  "vendor/midi-render-worker.js",
  "vendor/js-synthesizer/js-synthesizer.min.js",
  "vendor/js-synthesizer/libfluidsynth-2.4.6.js",
].map(withBase);

async function cacheOptional() {
  const cache = await caches.open(CACHE);
  await Promise.allSettled(
    OPTIONAL.map(async (url) => {
      if (await cache.match(url)) return;
      const response = await fetch(url, { cache: "no-cache" });
      if (response.ok) await cache.put(url, response.clone());
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // A single missing optional/core URL must not invalidate the whole shell.
      await Promise.allSettled(
        CORE.map(async (url) => {
          const response = await fetch(url, { cache: "no-cache" });
          if (response.ok) await cache.put(url, response.clone());
        }),
      );
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
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "gys-cache-optional")
    event.waitUntil(cacheOptional());
});
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
    event.respondWith(
      caches.open(REMOTE_MEDIA_CACHE).then((cache) =>
        cache.match(event.request).then(
          (cached) =>
            cached ??
            fetch(event.request).then((response) => {
              if (response.ok || response.type === "opaque")
                void cache.put(event.request, response.clone());
              return response;
            }),
        ),
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
            void caches
              .open(CACHE)
              .then((cache) => cache.put(event.request, copy));
            return response;
          })
          .catch(() => caches.match(withBase("index.html"))),
    ),
  );
});
