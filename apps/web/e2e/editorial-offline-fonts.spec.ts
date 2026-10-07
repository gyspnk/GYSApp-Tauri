import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "allow" });

test("reader minus controls use the bundled font without system fallback", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  await page.locator(".hymn-more-actions-summary").click();
  await page.locator(".hymn-reader-settings-summary").click();
  await expect(
    page.locator(".reader-preferences button").first(),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const session = await context.newCDPSession(page);
  await session.send("DOM.enable");
  await session.send("CSS.enable");
  const { root } = await session.send("DOM.getDocument");
  const { nodeId } = await session.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: ".reader-preferences button:first-of-type",
  });
  const { fonts } = await session.send("CSS.getPlatformFontsForNode", {
    nodeId,
  });
  expect(fonts).toHaveLength(1);
  expect(fonts[0]!.familyName).toBe("GYS Reading Sans");
  expect(fonts[0]!.isCustomFont).toBe(true);
  await session.detach();
});

test("an installed shell retains its reading fonts before switching language offline", async ({
  page,
  context,
}) => {
  test.skip(process.env.GYS_E2E_DEV === "1", "Production offline shell");
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/");
  await expect(page.locator(".home-grid")).toBeVisible();
  const manifest = await (
    await page.request.get("/GYSApp-Tauri/offline-shell-assets.json")
  ).json();
  const fonts: string[] = manifest.assets.filter((path: string) =>
    path.endsWith(".woff2"),
  );
  expect(fonts).toHaveLength(4);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
      timeout: 20_000,
    })
    .toBe(true);
  for (const font of fonts) {
    expect(
      await page.evaluate(
        async (path) =>
          !!(await caches.match(new URL(path, document.baseURI).href)),
        font,
      ),
    ).toBe(true);
  }
  await page.evaluate(() =>
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({ version: 1, locale: "zh", theme: "light" }),
    ),
  );
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "阅读与诗歌",
  );
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() =>
      document.fonts.check('24px "Noto Serif SC"', "阅读与诗歌"),
    ),
  ).toBe(true);
  for (const font of fonts) {
    const verified = await page.evaluate(
      async ({ path, digest }) => {
        const response = await fetch(new URL(path, document.baseURI));
        const hash = await crypto.subtle.digest(
          "SHA-256",
          await response.arrayBuffer(),
        );
        const base64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
        return response.ok && `sha256-${base64}` === digest;
      },
      { path: font, digest: manifest.integrity[font] },
    );
    expect(verified).toBe(true);
  }
});
