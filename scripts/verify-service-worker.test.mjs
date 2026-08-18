import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const serviceWorkerPath = new URL("../apps/web/public/sw.js", import.meta.url);
const source = readFileSync(serviceWorkerPath, "utf8");

function loadServiceWorker({ fetch }) {
  const handlers = new Map();
  const cache = {
    match: async () => undefined,
    put: async () => undefined,
  };
  const context = {
    Promise,
    URL,
    caches: {
      match: cache.match,
      open: async () => cache,
      keys: async () => [],
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
  return handlers;
}

test("service-worker shell cache is versioned after a deploy change", () => {
  assert.match(source, /const CACHE = "gysapp-shell-v11";/);
});

test("same-origin navigations refresh the shell from the network", async () => {
  const calls = [];
  const response = { ok: true, clone: () => response };
  const handlers = loadServiceWorker({
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
