import { expect, test } from "@playwright/test";
import { preparePinnedReaderAssets } from "./pinned-reader-fixtures.js";

test("startup checks the manifest every launch while reusing verified cached chords", async ({
  page,
}) => {
  await preparePinnedReaderAssets(page);
  let checks = 0;
  let files = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("assets-chord-manifest.json")) checks++;
    if (request.url().endsWith(".chord.json")) files++;
  });
  const cached = () =>
    page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const open = indexedDB.open("gysapp-platform-v1");
          open.onsuccess = () => {
            const db = open.result;
            if (!db.objectStoreNames.contains("key-value")) {
              db.close();
              resolve(false);
              return;
            }
            const get = db
              .transaction("key-value")
              .objectStore("key-value")
              .get("gys-chord-cache-index-v1");
            get.onsuccess = () => {
              resolve(Boolean(JSON.parse(get.result ?? "{}")["hymn-001"]));
              db.close();
            };
          };
        }),
    );
  await page.goto("/GYSApp-Tauri/");
  await expect.poll(cached, { timeout: 30_000 }).toBe(true);
  expect(checks).toBe(1);
  expect(files).toBe(1);
  await page.reload();
  await expect.poll(() => checks).toBe(2);
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  await page
    .getByRole("button", { name: "Tampilkan chord", exact: true })
    .click();
  await expect(page.locator(".chord-visual-row")).toHaveCount(4, {
    timeout: 20_000,
  });
  expect(files).toBe(1);
  await page.context().setOffline(true);
  await page
    .getByRole("button", { name: "Sembunyikan chord", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Tampilkan chord", exact: true })
    .click();
  await expect(page.locator(".chord-capability.is-hidden")).toHaveCount(0);
  expect(files).toBe(1);
});
