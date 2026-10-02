import { createHash, webcrypto } from "node:crypto";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const serviceWorkerPath = new URL("../apps/web/public/sw.js", import.meta.url);
const source = readFileSync(serviceWorkerPath, "utf8");
function loadServiceWorker({
  workerSource = source,
  fetch,
  cacheNames = [],
  cacheMatch,
  cacheMatchByName,
  cacheKeys,
  cacheDelete,
  cachePut,
}) {
  const handlers = new Map();
  const deletedCaches = [];
  const writes = [];
  const openedCaches = [];
  const claims = [];
  const skipWaitingCalls = [];
  const cache = {
    match: async (...args) => cacheMatch?.(...args),
    keys: async () => cacheKeys?.() ?? [],
    delete: async (...args) => cacheDelete?.(...args) ?? false,
    put: async (...args) => {
      writes.push(args);
      return cachePut?.(...args);
    },
  };
  const context = {
    Promise,
    URL,
    Response,
    crypto: webcrypto,
    btoa,
    caches: {
      match: cache.match,
      open: async (name) => {
        openedCaches.push(name);
        return {
          ...cache,
          match: async (...args) =>
            cacheMatchByName
              ? cacheMatchByName(name, ...args)
              : cache.match(...args),
        };
      },
      keys: async () => cacheNames,
      delete: async (name) => {
        deletedCaches.push(name);
        return true;
      },
    },
    fetch,
    self: {
      location: {
        origin: "https://gyspnk.github.io",
        pathname: "/GYSApp-Tauri/sw.js",
      },
      clients: {
        claim: async () => claims.push(true),
      },
      addEventListener(type, handler) {
        handlers.set(type, handler);
      },
      skipWaiting() {
        skipWaitingCalls.push(true);
      },
    },
  };

  vm.runInNewContext(workerSource, context, {
    filename: serviceWorkerPath.pathname,
  });
  return {
    handlers,
    deletedCaches,
    writes,
    openedCaches,
    claims,
    skipWaitingCalls,
  };
}

test("service-worker shell cache is versioned after a deploy change", () => {
  assert.match(source, /const CACHE = "gysapp-shell-v24";/);
  assert.doesNotMatch(source, /distributed-hymn-catalog/);
});

test("same-origin navigations refresh the shell from the network", async () => {
  const calls = [];
  const response = { ok: true, clone: () => response };
  const { handlers } = loadServiceWorker({
    fetch: async (request, init) => {
      calls.push({ request, init });
      return response;
    },
  });
  let result;
  handlers.get("fetch")({
    request: {
      method: "GET",
      mode: "navigate",
      url: "https://gyspnk.github.io/GYSApp-Tauri/",
    },
    respondWith(promise) {
      result = promise;
    },
  });

  await result;

  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.cache, "no-cache");
});

test("navigation writes retain the FetchEvent receiver", async () => {
  const response = { ok: true, clone: () => response };
  const { handlers, writes } = loadServiceWorker({
    fetch: async () => response,
  });
  let result;
  let lifetime;
  const event = {
    request: {
      method: "GET",
      mode: "navigate",
      url: "https://gyspnk.github.io/GYSApp-Tauri/",
    },
    respondWith(promise) {
      result = promise;
    },
    waitUntil(promise) {
      assert.equal(this, event);
      lifetime = promise;
    },
  };
  handlers.get("fetch")(event);
  assert.equal(await result, response);
  await lifetime;
  assert.equal(writes.length, 1);
});

test("install caches the app shell and editorial snapshots", async () => {
  const response = {
    ok: true,
    clone: () => response,
    text: async () => "<!doctype html><title>GYSApp</title>",
    json: async () => ({ version: 1, assets: [] }),
  };
  const { handlers, writes, openedCaches } = loadServiceWorker({
    fetch: async () => response,
  });
  let installation;
  handlers.get("install")({
    waitUntil(promise) {
      installation = promise;
    },
  });

  await installation;

  assert.ok(writes.some(([request]) => request === "/GYSApp-Tauri/"));
  assert.ok(openedCaches.includes("gysapp-content-v1"));
  assert.ok(
    writes.some(([request]) => request === "/GYSApp-Tauri/offline/sauh.json"),
  );
});

test("install prepares lazy build assets once and rejects non-build paths", async () => {
  const calls = [];
  const response = {
    ok: true,
    clone: () => response,
    text: async () => "<!doctype html>",
    json: async () => ({
      version: 1,
      assets: [
        "assets/kidung-settings-hash.js",
        "assets/kidung-settings-hash.js",
        "assets/reader-hash.css",
        "assets/sql-hash.wasm",
        "assets/editorial-hash.woff2",
        "https://unrelated.example/asset.js",
        "assets/../offline/catalog.js",
        "assets/music.pdf",
        42,
      ],
    }),
  };
  const { handlers, writes } = loadServiceWorker({
    fetch: async (url) => {
      calls.push(url);
      return response;
    },
  });
  let installation;
  handlers.get("install")({
    waitUntil(promise) {
      installation = promise;
    },
  });
  await installation;
  assert.equal(
    calls.filter((url) => url.endsWith("kidung-settings-hash.js")).length,
    1,
  );
  assert.ok(writes.some(([url]) => url.endsWith("reader-hash.css")));
  assert.ok(writes.some(([url]) => url.endsWith("sql-hash.wasm")));
  assert.ok(writes.some(([url]) => url.endsWith("editorial-hash.woff2")));
  assert.ok(!calls.some((url) => url.includes("unrelated.example")));
  assert.ok(!calls.some((url) => url.includes("../")));
  assert.ok(!calls.some((url) => url.endsWith("music.pdf")));
});

test("one unavailable build asset does not discard prepared routes", async () => {
  const response = {
    ok: true,
    clone: () => response,
    text: async () => "<!doctype html>",
    json: async () => ({
      version: 1,
      assets: ["assets/missing.js", "assets/reader.js"],
    }),
  };
  const { handlers, writes } = loadServiceWorker({
    fetch: async (url) => {
      if (url.endsWith("missing.js")) throw new Error("connection interrupted");
      return response;
    },
  });
  let installation;
  handlers.get("install")({
    waitUntil(promise) {
      installation = promise;
    },
  });
  await assert.rejects(installation, /interrupted/);
  assert.ok(writes.some(([url]) => url.endsWith("reader.js")));
  assert.ok(!writes.some(([url]) => url.endsWith("missing.js")));
});

test("prefetched same-origin modules survive an Origin Vary header offline", async () => {
  const cached = { source: "prepared-module" };
  const request = {
    method: "GET",
    mode: "cors",
    url: "https://gyspnk.github.io/GYSApp-Tauri/assets/settings-hash.js",
  };
  const { handlers } = loadServiceWorker({
    cacheMatch: async (lookup, options) => {
      assert.equal(lookup, request);
      return options?.ignoreVary ? cached : undefined;
    },
    fetch: async () => {
      assert.fail("prepared modules must not require the network");
    },
  });
  let result;
  handlers.get("fetch")({
    request,
    respondWith(promise) {
      result = promise;
    },
  });
  assert.equal(await result, cached);
});

test("failed native navigation falls back to the cached root shell", async () => {
  const cachedRoot = { source: "root-shell" };
  const lookups = [];
  const { handlers } = loadServiceWorker({
    fetch: async () => {
      throw new Error("native asset protocol cannot resolve route paths");
    },
    cacheMatch: async (request) => {
      lookups.push(request);
      return request === "/GYSApp-Tauri/" ? cachedRoot : undefined;
    },
  });
  let result;
  handlers.get("fetch")({
    request: {
      method: "GET",
      mode: "navigate",
      url: "https://gyspnk.github.io/GYSApp-Tauri/iman",
    },
    respondWith(promise) {
      result = promise;
    },
  });

  assert.equal(await result, cachedRoot);
  assert.deepEqual(lookups, ["/GYSApp-Tauri/index.html", "/GYSApp-Tauri/"]);
});

test("editorial snapshots use a cache that survives shell version changes", async () => {
  const response = { ok: true, clone: () => response };
  const { handlers, openedCaches } = loadServiceWorker({
    fetch: async () => response,
  });
  const pendingWrites = [];
  let result;
  handlers.get("fetch")({
    request: {
      method: "GET",
      mode: "cors",
      url: "https://gyspnk.github.io/GYSApp-Tauri/offline/sauh.json",
    },
    respondWith(promise) {
      result = promise;
    },
    waitUntil(promise) {
      pendingWrites.push(promise);
    },
  });

  await result;
  await Promise.all(pendingWrites);

  assert.deepEqual(openedCaches, ["gysapp-content-v1"]);
});

test("PDF responses are not duplicated into the unbounded shell cache", async () => {
  const response = {
    ok: true,
    headers: { get: () => "application/pdf" },
    clone: () => response,
  };
  const { handlers, writes } = loadServiceWorker({
    fetch: async () => response,
  });
  const pendingWrites = [];
  let result;
  handlers.get("fetch")({
    request: {
      method: "GET",
      mode: "cors",
      url: "https://gyspnk.github.io/GYSApp-Tauri/api/test.pdf",
    },
    respondWith(promise) {
      result = promise;
    },
    waitUntil(promise) {
      pendingWrites.push(promise);
    },
  });

  await result;
  await Promise.all(pendingWrites);

  assert.equal(writes.length, 0);
});

test("remote media cache evicts its oldest entry and stores the recovered image", async () => {
  const keys = Array.from({ length: 96 }, (_, index) => ({
    url: `https://tjc.org/media/${index}.jpg`,
  }));
  const deleted = [];
  const freshRequest = {
    method: "GET",
    mode: "no-cors",
    url: "https://tjc.org/media/recovered.jpg",
  };
  const response = {
    ok: true,
    type: "cors",
    clone: () => response,
  };
  const { handlers, writes } = loadServiceWorker({
    cacheKeys: async () => keys,
    cacheMatch: async () => undefined,
    cacheDelete: async (request) => {
      deleted.push(request);
      keys.splice(keys.indexOf(request), 1);
      return true;
    },
    cachePut: async (request) => {
      keys.push(request);
    },
    fetch: async (request) => {
      assert.equal(request, freshRequest);
      return response;
    },
  });
  let result;
  handlers.get("fetch")({
    request: freshRequest,
    respondWith(promise) {
      result = promise;
    },
  });

  assert.equal(await result, response);
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0].url, "https://tjc.org/media/0.jpg");
  assert.equal(keys.length, 96);
  assert.equal(keys.at(-1), freshRequest);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], freshRequest);
});

test("service-worker activation removes old shells and claims open clients", async () => {
  const { handlers, deletedCaches, claims } = loadServiceWorker({
    cacheNames: [
      "gysapp-shell-v18",
      "gysapp-shell-v19",
      "gysapp-remote-media-v1",
      "gys-bible-v4",
      "unrelated-cache",
    ],
    fetch: async () => ({ ok: true, clone: () => ({}) }),
  });
  let activation;
  handlers.get("activate")({
    waitUntil(promise) {
      activation = promise;
    },
  });

  assert.ok(activation);
  await activation;

  assert.deepEqual(deletedCaches, ["gysapp-shell-v18"]);
  assert.deepEqual(claims, [true]);
});

test("service-worker reset drains and clears application caches", async () => {
  const replies = [];
  const { handlers, deletedCaches } = loadServiceWorker({
    cacheNames: [
      "gysapp-shell-v16",
      "gysapp-remote-media-v1",
      "unrelated-cache",
    ],
    fetch: async () => ({ ok: true, clone: () => ({}) }),
  });
  let reset;
  handlers.get("message")({
    data: { type: "gys-clear-cache" },
    ports: [
      {
        postMessage(message) {
          replies.push(message);
        },
      },
    ],
    waitUntil(promise) {
      reset = promise;
    },
  });

  assert.ok(reset);
  await reset;

  assert.deepEqual(deletedCaches, [
    "gysapp-shell-v16",
    "gysapp-remote-media-v1",
  ]);
  assert.equal(replies.length, 1);
  assert.equal(replies[0].type, "gys-clear-cache-done");
});

test("service-worker does not repopulate caches after reset", async () => {
  const { handlers, writes } = loadServiceWorker({
    cacheNames: ["gysapp-shell-v16"],
    fetch: async () => ({ ok: true, clone: () => ({}) }),
  });
  let reset;
  handlers.get("message")({
    data: { type: "gys-clear-cache" },
    ports: [{ postMessage() {} }],
    waitUntil(promise) {
      reset = promise;
    },
  });
  await reset;

  let optional;
  handlers.get("message")({
    data: { type: "gys-cache-optional" },
    waitUntil(promise) {
      optional = promise;
    },
  });
  await optional;

  assert.equal(writes.length, 0);
});

test("new releases wait for explicit activation and an interrupted core cannot install", async () => {
  const { handlers, skipWaitingCalls, deletedCaches } = loadServiceWorker({
    fetch: async () => {
      throw new Error("offline mid-update");
    },
    cacheNames: ["gysapp-shell-working"],
  });
  let installation;
  handlers.get("install")({
    waitUntil(promise) {
      installation = promise;
    },
  });
  await assert.rejects(installation, /offline mid-update/);
  assert.deepEqual(skipWaitingCalls, []);
  assert.deepEqual(deletedCaches, []);
  handlers.get("message")({ data: { type: "SKIP_WAITING" } });
  assert.deepEqual(skipWaitingCalls, [true]);
});

test("activation retains the previously active build instead of newer interrupted caches", async () => {
  const active = "gysapp-shell-v24-working";
  const { handlers, deletedCaches } = loadServiceWorker({
    cacheNames: [
      active,
      "gysapp-shell-v24-partial1",
      "gysapp-shell-v24-partial2",
      "gysapp-shell-v24",
    ],
    cacheMatchByName: async (name, url) =>
      name === "gysapp-update-state-v1" && url.endsWith("__active-shell__")
        ? new Response(JSON.stringify({ active }))
        : undefined,
  });
  let activation;
  handlers.get("activate")({
    waitUntil(promise) {
      activation = promise;
    },
  });
  await activation;
  assert.deepEqual(deletedCaches, [
    "gysapp-shell-v24-partial1",
    "gysapp-shell-v24-partial2",
  ]);
});

for (const path of ["assets/reader.js", "assets/editorial.woff2"])
  test(`a corrupted prepared ${path} is refetched and verified before activation`, async () => {
    const good = "export const ready = true;";
    const integrity = `sha256-${createHash("sha256").update(good).digest("base64")}`;
    let moduleFetches = 0;
    const { handlers, writes } = loadServiceWorker({
      cacheMatchByName: async (_name, url) =>
        url.endsWith(path) ? new Response("corrupted") : undefined,
      fetch: async (url) => {
        if (url.endsWith("offline-shell-assets.json"))
          return new Response(
            JSON.stringify({
              version: 1,
              buildId: "test",
              assets: [path],
              integrity: { [path]: integrity },
            }),
          );
        if (url.endsWith(path)) {
          moduleFetches++;
          return new Response(good);
        }
        return new Response("<!doctype html>");
      },
    });
    let installation;
    handlers.get("install")({
      waitUntil(promise) {
        installation = promise;
      },
    });
    await installation;
    assert.equal(moduleFetches, 1);
    const prepared = writes.find(([url]) => url.endsWith(path));
    assert.equal(await prepared[1].text(), good);
  });

test("a later deployment cannot overwrite the active offline HTML", async () => {
  const buildId = "0123456789abcdef";
  const { handlers, writes } = loadServiceWorker({
    workerSource: source.replace(
      'gysapp-shell-v24"',
      `gysapp-shell-v24-${buildId}"`,
    ),
    fetch: async () =>
      new Response(
        '<html><meta name="gys-build-id" content="fedcba9876543210" /></html>',
      ),
  });
  let response;
  handlers.get("fetch")({
    request: {
      method: "GET",
      mode: "navigate",
      url: "https://gyspnk.github.io/GYSApp-Tauri/",
    },
    respondWith(promise) {
      response = promise;
    },
    waitUntil() {},
  });
  assert.equal((await response).status, 200);
  assert.equal(writes.length, 0);
});

test("deployment changes during installation cannot mix two releases", async () => {
  const { handlers } = loadServiceWorker({
    workerSource: source.replace(
      'gysapp-shell-v24"',
      'gysapp-shell-v24-0123456789abcdef"',
    ),
    fetch: async (url) =>
      url.endsWith("offline-shell-assets.json")
        ? new Response(
            JSON.stringify({
              version: 1,
              buildId: "fedcba9876543210",
              assets: [],
            }),
          )
        : new Response("<!doctype html>"),
  });
  let installation;
  handlers.get("install")({
    waitUntil(promise) {
      installation = promise;
    },
  });
  await assert.rejects(installation, /Build manifest changed/);
});

test("an interrupted core payload cannot install even with an HTTP success", async () => {
  const path = "offline/hymn-metadata.json";
  const expected = `sha256-${createHash("sha256").update("complete metadata").digest("base64")}`;
  const stored = new Map();
  const { handlers } = loadServiceWorker({
    cacheMatch: (url) => stored.get(url),
    cachePut: (url, response) => stored.set(url, response),
    fetch: async (url) =>
      url.endsWith("offline-shell-assets.json")
        ? new Response(
            JSON.stringify({
              version: 1,
              assets: [],
              coreIntegrity: { [path]: expected },
            }),
          )
        : new Response("truncated metadata"),
  });
  let installation;
  handlers.get("install")({
    waitUntil(promise) {
      installation = promise;
    },
  });
  await assert.rejects(installation, /Core integrity mismatch/);
});
