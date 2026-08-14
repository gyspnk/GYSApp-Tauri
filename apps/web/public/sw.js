const CACHE = "gysapp-shell-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll([
          "/GYSApp-Tauri/",
          "/GYSApp-Tauri/index.html",
          "/GYSApp-Tauri/manifest.webmanifest",
          "/GYSApp-Tauri/offline/bible/b_tb.db",
          "/GYSApp-Tauri/offline/bible/tb-reader.json",
          "/GYSApp-Tauri/offline/hymn-catalog.json",
          "/GYSApp-Tauri/offline/music-lock.json",
          "/GYSApp-Tauri/offline/faith.json",
          "/GYSApp-Tauri/offline/soundfont/TimGM6mb.sf2",
        ]),
      ),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ??
        fetch(event.request)
          .then((response) => {
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
