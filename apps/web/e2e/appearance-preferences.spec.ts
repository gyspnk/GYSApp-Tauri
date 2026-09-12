import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// This contract deliberately writes screenshots from real Chromium so visual
// acceptance is based on the rendered application rather than a mockup.
const previewDir = path.resolve("test-results", "ui-preview");

async function openAppearance(page: Page): Promise<void> {
  await page.goto("/GYSApp-Tauri/lainnya");
  await page.getByRole("button", { name: "Tampilan & keterbacaan" }).click();
  await expect(
    page.getByRole("dialog", { name: "Tampilan & keterbacaan" }),
  ).toBeVisible();
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
  await openAppearance(page);

  await expect(page.locator("html")).toHaveAttribute("data-ui-density", "standard");
  await expect(page.locator("html")).toHaveAttribute("data-ui-font", "auto");

  await page.getByRole("button", { name: /Nyaman/ }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-ui-density",
    "comfortable",
  );
  await page.getByRole("button", { name: /Himne/ }).click();
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

  const headingFont = await page.locator("h1").evaluate(
    (element) => getComputedStyle(element).fontFamily,
  );
  expect(headingFont.toLowerCase()).toContain("playfair");
});

test("compact mode stays touch-safe on phone and produces real visual evidence", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAppearance(page);
  await page.getByRole("button", { name: /Ringkas/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-ui-density", "compact");

  const navTargets = page.locator(".navigation-shell .nav-item");
  const undersized = await navTargets.evaluateAll((elements) =>
    elements.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (rect.width < 43.5 || rect.height < 43.5)
        ? [`${rect.width}x${rect.height}`]
        : [];
    }),
  );
  expect(undersized).toEqual([]);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);

  await savePreview(page, "appearance-compact-phone-390x844.png");
});

test("standard desktop and panel composition remain readable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openAppearance(page);
  await page.getByRole("button", { name: /Standar/ }).click();
  await page.getByRole("button", { name: /Otomatis/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-ui-density", "standard");
  await expect(page.locator("html")).toHaveAttribute("data-ui-font", "auto");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await savePreview(page, "appearance-standard-desktop-1440x900.png");
});

test("reduced motion keeps the appearance panel usable without nonessential animation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await openAppearance(page);
  const transitionDuration = await page.locator(".ui-preferences-panel").evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  );
  expect(transitionDuration.split(",").every((value) => value.trim() === "0s")).toBe(
    true,
  );
});
