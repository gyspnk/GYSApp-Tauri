import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { installNativeHomeFixture } from "../scripts/native-home-fixture.mjs";

test("native Home recovery fixture retains counters and availability across reloads", async ({
  page,
}) => {
  const snapshot = JSON.parse(
    await readFile(
      new URL("../public/offline/sauh.json", import.meta.url),
      "utf8",
    ),
  );
  await page.clock.setFixedTime(new Date("2026-09-28T10:00:00Z"));
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/");
  await page.evaluate(() => {
    sessionStorage.setItem(
      "gys-native-home-fixture-v1",
      JSON.stringify({
        requests: { sauh: 0, suara: 0, literature: 0, publisher: 0 },
        available: false,
        initialized: false,
      }),
    );
  });
  await page.addInitScript(installNativeHomeFixture, snapshot.items[0]);
  const requests = () =>
    page.evaluate(
      () =>
        (window as Window & { __gysNativeHomeRequests?: { suara: number } })
          .__gysNativeHomeRequests?.suara ?? 0,
    );
  const error = page.locator(".home-suara-section .error-panel");
  await page.reload();
  await expect(error).toBeVisible();
  const initial = await requests();
  expect(initial).toBeGreaterThan(0);
  await page.reload();
  await expect(error).toBeVisible();
  await expect.poll(requests).toBeGreaterThan(initial);
  const beforeRetry = await requests();
  await error.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await expect.poll(requests).toBeGreaterThan(beforeRetry);
  await expect(error).toBeVisible();
  await page.evaluate(() => {
    (
      window as Window & { __gysNativeHomeFeedsAvailable: boolean }
    ).__gysNativeHomeFeedsAvailable = true;
  });
  await page.reload();
  await expect(
    page.locator(".home-suara-section .suara-library-item").first(),
  ).toBeVisible();
  await expect(error).toHaveCount(0);
  await page.evaluate(() => {
    (
      window as Window & { __gysNativeHomeRestore: () => void }
    ).__gysNativeHomeRestore();
  });
  await page.reload();
  expect(await requests()).toBe(0);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("gys-native-home-fixture-v1"),
    ),
  ).toBeNull();
});
