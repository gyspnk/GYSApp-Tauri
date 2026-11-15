import { expect, test } from "@playwright/test";

// The welcome screen only appears on a device with no shell settings, so these
// tests clear the storage state the shared config seeds for every other spec.
test.use({ storageState: { cookies: [], origins: [] } });

const ROOT = "/GYSApp-Tauri/";

async function openWelcome(page: import("@playwright/test").Page) {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto(ROOT);
  await expect(page.locator(".welcome-card")).toBeVisible();
}

test("a first visit greets the reader in one heading and can skip", async ({
  page,
}) => {
  await openWelcome(page);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveText("Selamat datang di GYSApp");
  const skip = page.getByRole("button", { name: "Lewati, mulai membaca" });
  const box = await skip.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await skip.click();
  await expect(page.locator(".welcome-page")).toHaveCount(0);
  await expect(page.locator(".home-grid")).toBeVisible();
  const stored = await page.evaluate(() =>
    localStorage.getItem("gys-shell-settings-v1"),
  );
  expect(JSON.parse(stored ?? "{}")).toMatchObject({ onboarded: true });
  await page.reload();
  await expect(page.locator(".welcome-page")).toHaveCount(0);
});

test("the language choice applies before the reader starts", async ({
  page,
}) => {
  await openWelcome(page);
  await page.getByRole("combobox", { name: "Pilih bahasa" }).click();
  await page.getByRole("option", { name: "English" }).click();
  await expect(page.locator("h1")).toHaveText("Welcome to GYSApp");
  await page.getByRole("combobox", { name: "Choose a language" }).click();
  await page.getByRole("option", { name: "中文" }).click();
  await expect(page.locator("h1")).toHaveText("欢迎使用 GYSApp");
  await page.getByRole("button", { name: "跳过，开始阅读" }).click();
  await expect(page.locator(".home-grid")).toBeVisible();
  const stored = await page.evaluate(() =>
    localStorage.getItem("gys-shell-settings-v1"),
  );
  expect(JSON.parse(stored ?? "{}")).toMatchObject({
    locale: "zh",
    onboarded: true,
  });
});

test("the sign-in offer never doubles its label and stays optional", async ({
  page,
}) => {
  await openWelcome(page);
  const control = page.locator(".egys-google-control");
  await expect(control).toBeVisible();
  // The decorative face and the fallback both say "Google"; only one may show.
  const visibleLabels = await control.evaluate((element) =>
    Array.from(
      element.querySelectorAll(".egys-google-face, .egys-google-fallback"),
    )
      .filter((node) => getComputedStyle(node).display !== "none")
      .map((node) => node.textContent?.trim()),
  );
  expect(visibleLabels).toEqual(["Google"]);
  // The press target is the pill inside the provider frame, not the frame
  // itself: a 1 px border used to shrink 44 px of control to a 42 px button.
  const press = await page
    .locator(".welcome-login .egys-google-control .egys-google-fallback")
    .boundingBox();
  expect(press?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(press?.width ?? 0).toBeGreaterThanOrEqual(44);
  await expect(
    page.getByRole("button", { name: "Lewati, mulai membaca" }),
  ).toBeVisible();
});

test("reduced motion keeps the welcome screen still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWelcome(page);
  const durations = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".welcome-card, .welcome-skip")).map(
      (node) => getComputedStyle(node).transitionDuration,
    ),
  );
  expect(durations.every((value) => value === "0s")).toBe(true);
});

test("a landscape phone shows the skip without scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await openWelcome(page);
  const metrics = await page.evaluate(() => {
    const skip = document
      .querySelector(".welcome-skip")
      ?.getBoundingClientRect();
    const google = document
      .querySelector(".egys-google-fallback")
      ?.getBoundingClientRect();
    return {
      skipBottom: skip?.bottom ?? 0,
      skipTop: skip?.top ?? 0,
      skipHeight: skip?.height ?? 0,
      googleHeight: google?.height ?? 0,
      viewport: innerHeight,
      scroll: document.documentElement.scrollHeight - innerHeight,
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  // The way out of the first screen must be reachable without a scroll.
  expect(metrics.skipTop).toBeGreaterThanOrEqual(0);
  expect(metrics.skipBottom).toBeLessThanOrEqual(metrics.viewport);
  expect(metrics.scroll).toBeLessThanOrEqual(1);
  expect(metrics.overflow).toBeLessThanOrEqual(1);
  expect(metrics.skipHeight).toBeGreaterThanOrEqual(44);
  expect(metrics.googleHeight).toBeGreaterThanOrEqual(44);
  await expect(page.locator("h1")).toHaveCount(1);
});
