import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

test.use({ serviceWorkers: "allow" });

const APP_BASE = "/GYSApp-Tauri";
const publicRoot = resolve(
  fileURLToPath(new URL("../public", import.meta.url)),
);
const workerUrl = new URL("../public/sw.js", import.meta.url);

test("activation migrates previous editorial content and keeps PDFs out of shell cache", async ({
  browser,
}) => {
  test.setTimeout(30_000);
  const workerSource = await readFile(workerUrl, "utf8");
  const currentVersion = Number(
    workerSource.match(/const CACHE = "gysapp-shell-v(\d+)";/)?.[1],
  );
  expect(currentVersion).toBeGreaterThan(1);
  const previousCache = `gysapp-shell-v${currentVersion - 1}`;
  const currentCache = `gysapp-shell-v${currentVersion}`;
  const editorialStatuses: number[] = [];
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const appPath = pathname.startsWith(APP_BASE)
      ? pathname.slice(APP_BASE.length) || "/"
      : pathname;

    if (appPath === "/sw.js") {
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "text/javascript; charset=utf-8",
      });
      response.end(workerSource);
      return;
    }
    if (appPath === "/" || appPath === "/index.html") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(
        "<!doctype html><title>SW fixture</title><main>Fixture</main>",
      );
      return;
    }
    if (appPath === "/offline/sauh.json") {
      editorialStatuses.push(503);
      response.writeHead(503, {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      });
      response.end("unavailable");
      return;
    }
    if (appPath === "/api/test.pdf") {
      response.writeHead(200, { "content-type": "application/pdf" });
      response.end("%PDF-1.4 fixture");
      return;
    }
    if (appPath === "/favicon.ico") {
      response.writeHead(204).end();
      return;
    }

    const path = resolve(publicRoot, `.${appPath}`);
    if (!path.startsWith(`${publicRoot}${sep}`)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const body = await readFile(path);
      const contentType =
        extname(path) === ".json"
          ? "application/json; charset=utf-8"
          : "application/octet-stream";
      response.writeHead(200, { "content-type": contentType });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Fixture server did not bind");
  const origin = `http://127.0.0.1:${address.port}`;
  const context = await browser.newContext({ serviceWorkers: "allow" });
  const page = await context.newPage();

  try {
    await page.goto(`${origin}${APP_BASE}/`);
    await page.evaluate(
      ({ cacheName, contentUrl }) =>
        caches.open(cacheName).then((cache) =>
          cache.put(
            contentUrl,
            new Response(JSON.stringify({ revision: "old" }), {
              headers: { "content-type": "application/json" },
            }),
          ),
        ),
      {
        cacheName: previousCache,
        contentUrl: `${origin}${APP_BASE}/offline/sauh.json`,
      },
    );

    await page.evaluate(async (basePath) => {
      await navigator.serviceWorker.register(`${basePath}/sw.js`, {
        updateViaCache: "none",
      });
      await navigator.serviceWorker.ready;
    }, APP_BASE);
    await page.waitForFunction(
      ({ oldCache, newCache }) =>
        caches
          .keys()
          .then(
            (names) => names.includes(newCache) && !names.includes(oldCache),
          ),
      { oldCache: previousCache, newCache: currentCache },
    );
    await page.waitForFunction(() =>
      Boolean(navigator.serviceWorker.controller),
    );

    const contentPlacement = await page.evaluate(
      async ({ basePath, shellName }) => {
        const url = new URL(`${basePath}/offline/sauh.json`, location.href)
          .href;
        const stable = await caches.open("gysapp-content-v1");
        const shell = await caches.open(shellName);
        return {
          stableSnapshot: Boolean(await stable.match(url)),
          shellSnapshot: Boolean(await shell.match(url)),
        };
      },
      { basePath: APP_BASE, shellName: currentCache },
    );
    expect(contentPlacement).toEqual({
      stableSnapshot: true,
      shellSnapshot: false,
    });

    await context.setOffline(true);
    const snapshot = await page.evaluate(
      async (basePath) =>
        (await (await fetch(`${basePath}/offline/sauh.json`)).json()) as {
          revision: string;
        },
      APP_BASE,
    );
    expect(snapshot).toEqual({ revision: "old" });

    await context.setOffline(false);
    await page.evaluate(
      (basePath) =>
        fetch(`${basePath}/api/test.pdf`).then((response) =>
          response.arrayBuffer(),
        ),
      APP_BASE,
    );
    const cachedPdf = await page.evaluate(
      async (basePath) =>
        Boolean(
          await caches.match(
            new URL(`${basePath}/api/test.pdf`, location.href).href,
          ),
        ),
      APP_BASE,
    );
    expect(cachedPdf).toBe(false);
    expect(editorialStatuses).toEqual([503]);
  } finally {
    await context.close();
    await new Promise<void>((resolveClose, reject) =>
      server.close((error) => (error ? reject(error) : resolveClose())),
    );
  }
});
