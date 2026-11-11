import { expect, test } from "@playwright/test";
import { createServer } from "node:http";

test.use({ serviceWorkers: "allow" });

// Offline reloads re-install the worker and boot the shell from cache; under a
// sharded run that easily doubles the wall time, so this file keeps triple the
// default budget instead of failing on contention.
test.slow();

test("the real installed build has no stale update banner after reload", async ({
  page,
}) => {
  test.skip(process.env.GYS_E2E_DEV === "1", "Production update coordinator");
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/");
  await expect(page.locator(".home-grid")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
      timeout: 20_000,
    })
    .toBe(true);
  for (let reload = 0; reload < 2; reload++) {
    await page.reload();
    await expect(page.locator(".home-grid")).toBeVisible();
    await page.evaluate(async () =>
      (await navigator.serviceWorker.ready).update(),
    );
    await expect(page.locator(".app-update-banner")).toHaveCount(0);
  }
});

test("a real waiting worker activates once without another ready banner", async ({
  page,
}) => {
  test.skip(process.env.GYS_E2E_DEV === "1", "Production update coordinator");
  let revision = 1;
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (pathname.endsWith("/sw.js")) {
      response.writeHead(200, {
        "content-type": "text/javascript",
        "cache-control": "no-store",
      });
      response.end(`// revision ${revision}
        self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
        self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });`);
      return;
    }
    try {
      const upstream = await fetch(`http://127.0.0.1:4173${pathname}`);
      response.writeHead(upstream.status, {
        "content-type":
          upstream.headers.get("content-type") ?? "application/octet-stream",
      });
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      response.writeHead(503).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test server address");
  try {
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto(`http://127.0.0.1:${address.port}/GYSApp-Tauri/`);
    await expect(page.locator(".home-grid")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    await expect(page.locator(".app-update-banner")).toHaveCount(0);
    const navigations: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations.push(frame.url());
    });
    revision = 2;
    await page.evaluate(async () =>
      (await navigator.serviceWorker.ready).update(),
    );
    // The new worker installs itself: one reload, no button to press, no
    // banner left behind afterwards.
    await expect
      .poll(() => navigations.length, { timeout: 20_000 })
      .toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(1500);
    expect(navigations, "one reload, not a loop").toHaveLength(1);
    await expect(page.locator(".home-grid")).toBeVisible();
    await expect(page.locator(".app-update-banner")).toHaveCount(0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
