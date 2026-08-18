import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const serviceWorkerPath = new URL("../apps/web/public/sw.js", import.meta.url);
const source = readFileSync(serviceWorkerPath, "utf8");

function loadServiceWorker({ fetch, cacheNames = [] }) {
  const handlers = new Map();
  const deletedCaches = [];
  const writes = [];
  const cache = {
    match: async () => undefined,
    put: async (...args) => {
      writes.push(args);
    },
  };
  const context = {
    Promise,
    URL,
    caches: {
      match: cache.match,
      open: async () => cache,
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
      addEventListener(type, handler) {
        handlers.set(type, handler);
      },
      skipWaiting() {},
    },
  };

  vm.runInNewContext(source, context, { filename: serviceWorkerPath.pathname });
  return { handlers, deletedCaches, writes };
}

test("service-worker shell cache is versioned after a deploy change", () => {
  assert.match(source, /const CACHE = "gysapp-shell-v11";/);
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

test("service-worker reset drains and clears application caches", async () => {
  const replies = [];
  const { handlers, deletedCaches } = loadServiceWorker({
    cacheNames: [
      "gysapp-shell-v11",
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
    "gysapp-shell-v11",
    "gysapp-remote-media-v1",
  ]);
  assert.equal(replies.length, 1);
  assert.equal(replies[0].type, "gys-clear-cache-done");
});

test("service-worker does not repopulate caches after reset", async () => {
  const { handlers, writes } = loadServiceWorker({
    cacheNames: ["gysapp-shell-v11"],
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
