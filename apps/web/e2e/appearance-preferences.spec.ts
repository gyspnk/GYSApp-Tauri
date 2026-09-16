import { expect, test, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// This contract deliberately writes screenshots from real Chromium so visual
// acceptance is based on the rendered application rather than a mockup.
const previewDir = path.resolve("test-results", "ui-preview");

async function openAppearance(
  page: Page,
): Promise<{ dialog: Locator; opener: Locator }> {
  await page.goto("/GYSApp-Tauri/lainnya");
  const opener = page.getByRole("button", { name: "Tampilan & keterbacaan" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Tampilan & keterbacaan" });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() =>
      dialog.evaluate((element) => getComputedStyle(element).transform),
    )
    .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  return { dialog, opener };
}

async function savePreview(page: Page, name: string): Promise<void> {
  fs.mkdirSync(previewDir, { recursive: true });
  await page.screenshot({
    path: path.join(previewDir, name),
    fullPage: false,
    animations: "disabled",
  });
}

test("appearance preferences apply immediately and survive reload/navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  const { dialog } = await openAppearance(page);

  await expect(page.locator("html")).toHaveAttribute(
    "data-ui-density",
    "standard",
  );
  await expect(page.locator("html")).toHaveAttribute("data-ui-font", "auto");

  await dialog.getByRole("radio", { name: /^Nyaman/ }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-ui-density",
    "comfortable",
  );
  await dialog.getByRole("radio", { name: /^Himne/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-ui-font", "hymnal");

  await savePreview(page, "appearance-comfortable-tablet-768x1024.png");

  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.locator("html")).toHaveAttribute(
    "data-ui-density",
    "comfortable",
  );
  await expect(page.locator("html")).toHaveAttribute("data-ui-font", "hymnal");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-ui-density",
    "comfortable",
  );
  await expect(page.locator("html")).toHaveAttribute("data-ui-font", "hymnal");

  const headingFont = await page
    .locator("h1")
    .evaluate((element) => getComputedStyle(element).fontFamily);
  expect(headingFont.toLowerCase()).toContain("playfair");
});

test("compact mode stays touch-safe and keeps mobile sheet controls reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { dialog } = await openAppearance(page);
  await dialog.getByRole("radio", { name: /^Ringkas/ }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-ui-density",
    "compact",
  );

  const heading = dialog.getByRole("heading", {
    name: "Tampilan & keterbacaan",
  });
  const closeButton = dialog.getByRole("button", {
    name: "Tutup pengaturan tampilan",
  });
  await expect(heading).toBeInViewport();
  await expect(closeButton).toBeInViewport();

  const navTargets = page.locator(".navigation-shell .nav-item");
  const undersized = await navTargets.evaluateAll((elements) =>
    elements.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 &&
        rect.height > 0 &&
        (rect.width < 43.5 || rect.height < 43.5)
        ? [`${rect.width}x${rect.height}`]
        : [];
    }),
  );
  expect(undersized).toEqual([]);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);

  await savePreview(page, "appearance-compact-phone-390x844.png");
});

test("standard desktop, automatic font, and sans font remain readable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { dialog } = await openAppearance(page);
  await dialog.getByRole("radio", { name: /^Standar/ }).click();
  await dialog.getByRole("radio", { name: /^Sans modern/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-ui-font", "sans");
  const sansHeadingFont = await dialog
    .locator("h2")
    .evaluate((element) => getComputedStyle(element).fontFamily);
  expect(sansHeadingFont.toLowerCase()).not.toContain("playfair");

  await dialog.getByRole("radio", { name: /^Otomatis/ }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-ui-density",
    "standard",
  );
  await expect(page.locator("html")).toHaveAttribute("data-ui-font", "auto");
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await savePreview(page, "appearance-standard-desktop-1440x900.png");
});

test("appearance controls stay legible with the existing dark theme", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("gys-theme", "dark");
  });
  await page.setViewportSize({ width: 768, height: 1024 });
  const { dialog } = await openAppearance(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await dialog.getByRole("radio", { name: /^Nyaman/ }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-ui-density",
    "comfortable",
  );
  await savePreview(page, "appearance-dark-comfortable-tablet-768x1024.png");
});

test("Escape closes appearance settings and restores focus to the launcher", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { dialog, opener } = await openAppearance(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("reduced motion keeps the appearance panel usable without nonessential animation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  const { dialog } = await openAppearance(page);
  const transitionDuration = await dialog.evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  );
  expect(
    transitionDuration.split(",").every((value) => value.trim() === "0s"),
  ).toBe(true);
});

test("phone sheet exposes every preference before any selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const { dialog } = await openAppearance(page);

  for (const name of [
    "Nyaman",
    "Standar",
    "Ringkas",
    "Otomatis",
    "Himne",
    "Sans modern",
  ]) {
    const option = dialog.getByRole("radio", {
      name: new RegExp(`^${name}`),
    });
    await option.scrollIntoViewIfNeeded();
    await expect(option).toBeVisible();
  }
  await expect(dialog.getByRole("button", { name: "Selesai" })).toBeVisible();
});

for (const width of [599, 600, 959, 960]) {
  test(`appearance panel uses the correct sheet boundary at ${width}px`, async ({
    page,
  }) => {
    const height = 640;
    await page.setViewportSize({ width, height });
    const { dialog } = await openAppearance(page);
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    if (width < 600) {
      expect(box!.y + box!.height).toBeCloseTo(height, -1);
    } else {
      expect(box!.y).toBeGreaterThan(8);
    }
  });
}

test("keyboard traversal stays inside preferences and restores focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  const { dialog, opener } = await openAppearance(page);
  const radios = dialog.getByRole("radio");
  await radios.first().focus();

  for (let index = 0; index < 7; index += 1) {
    await page.keyboard.press("Tab");
    await expect
      .poll(() =>
        dialog.evaluate((element) => element.contains(document.activeElement)),
      )
      .toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("preferences contain enlarged text without document overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const { dialog } = await openAppearance(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await dialog
    .getByRole("radio", { name: /^Sans modern/ })
    .scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});
