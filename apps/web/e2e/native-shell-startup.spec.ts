import { expect, test } from "@playwright/test";

test("packaged shell opens Home without registering a browser worker", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: { invoke: async () => null },
      configurable: true,
    });
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        register: async () => {
          localStorage.setItem("gys-native-worker-registered", "1");
          throw new Error("Unexpected native worker registration");
        },
      },
      configurable: true,
    });
  });
  await page.goto("/GYSApp-Tauri/index.html");
  await expect(page.locator(".home-grid")).toBeVisible();
  await expect(page).toHaveURL(/\/GYSApp-Tauri\/$/);
  await expect
    .poll(() =>
      page.evaluate(
        () => performance.getEntriesByName("gys-shell-ready").length,
      ),
    )
    .toBe(1);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("gys-native-worker-registered"),
    ),
  ).toBeNull();
});
