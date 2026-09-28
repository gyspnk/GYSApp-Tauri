import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const serviceWorkerPath = new URL("../apps/web/public/sw.js", import.meta.url);
const source = readFileSync(serviceWorkerPath, "utf8");
function loadServiceWorker({
  fetch,
  cacheNames = [],
  cacheMatch,
  cacheKeys,
  cacheDelete,
  cachePut,
}) {
  const handlers = new Map();
  const deletedCaches = [];
  const writes = [];
  const openedCaches = [];
  const claims = [];
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
    caches: {
      match: cache.match,
      open: async (name) => {
        openedCaches.push(name);
        return cache;
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
      skipWaiting() {},
    },
  };

  vm.runInNewContext(source, context, { filename: serviceWorkerPath.pathname });
  return { handlers, deletedCaches, writes, openedCaches, claims };
}

test("service-worker shell cache is versioned after a deploy change", () => {
  assert.match(source, /const CACHE = "gysapp-shell-v22";/);
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

test("install caches the app shell and editorial snapshots", async () => {
  const response = {
    ok: true,
    clone: () => response,
    text: async () => "<!doctype html><title>GYSApp</title>",
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

  assert.deepEqual(deletedCaches, ["gysapp-shell-v18", "gysapp-shell-v19"]);
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
