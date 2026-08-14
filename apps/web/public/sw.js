const CACHE = "gysapp-shell-v6";
const REMOTE_MEDIA_CACHE = "gysapp-remote-media-v1";
const PRECACHE = [
  "/GYSApp-Tauri/",
  "/GYSApp-Tauri/index.html",
  "/GYSApp-Tauri/manifest.webmanifest",
  "/GYSApp-Tauri/offline/bible/tb-reader.json",
  "/GYSApp-Tauri/offline/hymn-catalog.json",
  "/GYSApp-Tauri/offline/music-lock.json",
  "/GYSApp-Tauri/offline/faith.json",
  "/GYSApp-Tauri/offline/sauh.json",
  "/GYSApp-Tauri/offline/literature.json",
  "/GYSApp-Tauri/offline/asset-manifest.json",
  "/GYSApp-Tauri/offline/fork-hymnal-manifest.json",
  "/GYSApp-Tauri/offline/soundfont/TimGM6mb.sf2",
];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
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
          .catch(() => caches.match("/GYSApp-Tauri/index.html")),
    ),
  );
});
