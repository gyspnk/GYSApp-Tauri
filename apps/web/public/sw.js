const CACHE = "gysapp-shell-v24";
const SHELL_STATE_CACHE = "gysapp-update-state-v1";
const CONTENT_CACHE = "gysapp-content-v1";
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
  "offline/hymn-metadata.json",
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
// Editorial content snapshots change independently of the shell between
// deploys. These must revalidate against the network first (falling back to
// cache offline) so a GitHub Pages deploy is picked up without waiting for a
// full shell update; shell-vendored code/data keeps cache-first below.
const CONTENT_JSON = [
  "offline/sauh.json",
  "offline/suara-sejati.json",
  "offline/literature.json",
  "offline/faith.json",
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

function isPdfResponse(requestUrl, response) {
  const contentType = response.headers.get("content-type") ?? "";
  return (
    requestUrl.pathname.toLowerCase().endsWith(".pdf") ||
    contentType.split(";", 1)[0].trim().toLowerCase() === "application/pdf"
  );
}

async function preserveEditorialContent(oldShellNames) {
  const contentCache = await caches.open(CONTENT_CACHE);
  // CacheStorage.keys() is insertion ordered, so copy from newest old shell
  // first and keep already migrated snapshots when multiple releases exist.
  for (const name of [...oldShellNames].reverse()) {
    const oldShell = await caches.open(name);
    for (const url of CONTENT_JSON) {
      if (await contentCache.match(url)) continue;
      const response = await oldShell.match(url);
      if (response) await putCached(contentCache, url, response);
    }
  }
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

async function hasBuildIntegrity(response, expected) {
  if (!expected) return true;
  const hash = await crypto.subtle.digest(
    "SHA-256",
    await response.clone().arrayBuffer(),
  );
  return (
    `sha256-${btoa(String.fromCharCode(...new Uint8Array(hash)))}` === expected
  );
}

async function cacheBuildAssets(cache) {
  const response = await fetch(withBase("offline-shell-assets.json"), {
    cache: "no-cache",
  });
  if (!response.ok) throw new Error("Build manifest unavailable");
  const manifest = await response.json();
  if (manifest.version !== 1 || !Array.isArray(manifest.assets))
    throw new Error("Build manifest invalid");
  const ownedBuild = CACHE.match(/v24-([a-f0-9]{16})$/)?.[1];
  if (ownedBuild && manifest.buildId !== ownedBuild)
    throw new Error("Build manifest changed during installation");
  if (ownedBuild && !manifest.coreIntegrity)
    throw new Error("Core integrity missing");
  await Promise.all(
    Object.entries(manifest.coreIntegrity ?? {}).map(
      async ([path, expected]) => {
        const url = withBase(path);
        if (!CORE.includes(url)) throw new Error("Core integrity path invalid");
        const stored = CONTENT_JSON.includes(
          new URL(url, self.location.origin).pathname,
        )
          ? await (await caches.open(CONTENT_CACHE)).match(url)
          : await cache.match(url);
        if (!stored || !(await hasBuildIntegrity(stored, expected)))
          throw new Error(`Core integrity mismatch: ${path}`);
      },
    ),
  );
  const assets = [...new Set(manifest.assets)].filter(
    (path) =>
      typeof path === "string" &&
      /^assets\/[A-Za-z0-9_./-]+\.(?:js|mjs|css|wasm)$/.test(path) &&
      !path.split("/").some((segment) => segment === ".." || segment === "."),
  );
  const results = await Promise.allSettled(
    assets.map(async (path) => {
      const url = withBase(path);
      const expected = manifest.integrity?.[path];
      if (manifest.buildId && !expected)
        throw new Error(`Build integrity missing: ${path}`);
      const cached = await cache.match(url);
      if (cached && (await hasBuildIntegrity(cached, expected))) return;
      if (cached) await cache.delete(url);
      const asset = await fetch(url, { cache: "no-cache" });
      if (!asset.ok) throw new Error(`Build asset unavailable: ${path}`);
      if (!(await hasBuildIntegrity(asset, expected)))
        throw new Error(`Build asset integrity mismatch: ${path}`);
      await putCached(cache, url, asset.clone());
    }),
  );
  if (results.some((result) => result.status === "rejected"))
    throw new Error("Build asset preparation interrupted");
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
      // Do not publish an incomplete offline core over a working release.
      await Promise.all(
        CORE.map(async (url) => {
          const response = await fetch(url, { cache: "no-cache" });
          if (!response.ok) throw new Error(`Core asset unavailable: ${url}`);
          if (response.ok) {
            if (
              CONTENT_JSON.includes(new URL(url, self.location.origin).pathname)
            ) {
              await putNamedCached(CONTENT_CACHE, url, response.clone());
            } else {
              await putCached(cache, url, response.clone());
            }
          }
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
      // Installation completes after the hashed lazy code is prepared, so an
      // unvisited core view can open offline. This never executes its modules
      // or blocks the page's first render. Every asset must pass integrity
      // verification before this build can activate.
      await cacheBuildAssets(cache);
    }),
  );
  // Existing clients activate updates explicitly after finishing their work.
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then(async (keys) => {
        const oldShells = keys.filter(
          (key) => key.startsWith("gysapp-shell-") && key !== CACHE,
        );
        // Failed installations can leave partial caches. Retain the previous
        // activated build, never whichever partial cache happened to be newest.
        const state = await caches.open(SHELL_STATE_CACHE);
        const markerUrl = withBase("__active-shell__");
        const marker = await state.match(markerUrl);
        const saved = await marker?.json().catch(() => undefined);
        const previous =
          saved?.active === CACHE ? saved.previous : saved?.active;
        const retained =
          typeof previous === "string" && previous.startsWith("gysapp-shell-")
            ? previous
            : oldShells
                .filter((key) => !key.startsWith("gysapp-shell-v24-"))
                .at(-1);
        await preserveEditorialContent(oldShells);
        await putCached(
          state,
          markerUrl,
          new Response(JSON.stringify({ active: CACHE, previous: retained }), {
            headers: { "Content-Type": "application/json" },
          }),
        );
        await Promise.all(
          oldShells
            .filter((key) => key !== retained)
            .map((key) => caches.delete(key)),
        );
      })
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
  // gyschordweb PURGE_URLS parity: delete cached entries whose URL contains
  // any of the given needles. Used for self-healing when a cached PDF.js
  // worker/source chunk is corrupted and PDF loading fails repeatedly.
  if (event.data?.type === "gys-purge-urls") {
    const needles = Array.isArray(event.data.urls) ? event.data.urls : [];
    const reply = event.ports?.[0];
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.allSettled(
          names.filter(isAppCache).map(async (name) => {
            const cache = await caches.open(name);
            const requests = await cache.keys();
            await Promise.allSettled(
              requests.map((request) => {
                const url = request.url || "";
                if (needles.some((needle) => url.indexOf(needle) !== -1)) {
                  return cache.delete(request);
                }
                return Promise.resolve(false);
              }),
            );
          }),
        );
        reply?.postMessage({ type: "gys-purge-urls-done" });
      })(),
    );
  }
});

async function fetchAndCacheShell(request, waitUntil) {
  const response = await fetch(request, { cache: "no-cache" });
  if (response.ok) {
    // Do not overwrite the active offline shell with HTML from a deployment
    // whose modules belong to a worker that has not finished installing.
    const ownedBuild = CACHE.match(/v24-([a-f0-9]{16})$/)?.[1];
    if (ownedBuild) {
      const html = await response.clone().text();
      if (!html.includes(`name="gys-build-id" content="${ownedBuild}"`))
        return response;
    }
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
    // Only cache media from the verified TJC source (site + its official S3
    // upload mirror). This keeps real literature/Sauh/Suara covers available
    // after the first online visit without turning the service worker into an
    // arbitrary cross-origin proxy.
    const isTjcMedia =
      (requestUrl.hostname === "tjc.org" ||
        requestUrl.hostname === "www.tjc.org" ||
        requestUrl.hostname === "tjcorguploads.s3.amazonaws.com") &&
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
      fetchAndCacheShell(event.request, (promise) =>
        event.waitUntil(promise),
      ).catch(
        async () =>
          (await (await caches.open(CACHE)).match(withBase("index.html"))) ??
          (await caches.open(CACHE)).match(withBase("")),
      ),
    );
    return;
  }

  if (CONTENT_JSON.includes(requestUrl.pathname)) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request, { cache: "no-cache" });
          if (!response.ok) throw new Error(String(response.status));
          const copy = response.clone();
          event.waitUntil(
            putNamedCached(CONTENT_CACHE, event.request, copy).catch(
              () => undefined,
            ),
          );
          return response;
        } catch {
          // offline / transient failure: serve the cached snapshot below
        }
        return (
          (await caches
            .open(CONTENT_CACHE)
            .then((cache) => cache.match(event.request))) ?? Response.error()
        );
      })(),
    );
    return;
  }

  const isBuildAsset =
    requestUrl.pathname.startsWith(withBase("assets/")) &&
    /\.(?:js|mjs|css|wasm)$/.test(requestUrl.pathname);
  event.respondWith(
    // Vite preview varies on Origin: a worker's prefetch and a module import
    // carry different request headers. Same-origin build bytes are immutable
    // and shared by both requests; editorial/provider responses keep Vary.
    caches
      .open(CACHE)
      .then(
        async (cache) =>
          (await cache.match(event.request, { ignoreVary: isBuildAsset })) ??
          (isBuildAsset
            ? await caches.match(event.request, { ignoreVary: true })
            : undefined),
      )
      .then(
        (cached) =>
          cached ??
          fetch(event.request)
            .then((response) => {
              if (!response.ok || isPdfResponse(requestUrl, response))
                return response;
              const copy = response.clone();
              event.waitUntil(
                putNamedCached(CACHE, event.request, copy).catch(
                  () => undefined,
                ),
              );
              return response;
            })
            .catch(() => caches.match(withBase("index.html"))),
      ),
  );
});
