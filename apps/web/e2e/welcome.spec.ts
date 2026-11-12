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
