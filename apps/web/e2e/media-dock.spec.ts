import { expect, test, type Page } from "@playwright/test";

async function openSpeechPlayerAtDesktop(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/GYSApp-Tauri/bible");
  await expect(
    page.getByRole("heading", { name: "Alkitab", exact: true }),
  ).toBeVisible();
  const read = page.getByRole("button", { name: "Bacakan" });
  await expect(read).toBeEnabled({ timeout: 15_000 });
  await read.click();
  await expect(page.locator(".media-surface")).toBeVisible({ timeout: 15_000 });
}

async function expectCentered(page: Page, width: number) {
  const box = await page.locator(".media-surface").boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box!.x + box!.width / 2 - width / 2)).toBeLessThanOrEqual(3);
  return box!;
}

test("persistent media defaults to one centered semantic dock", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.removeItem("gys-media-position-v1"),
  );
  await openSpeechPlayerAtDesktop(page);
  await expectCentered(page, 1440);
  await expect(page.getByRole("button", { name: "Ciutkan panel" })).toHaveCount(
    0,
  );
  const minimize = page.getByRole("button", { name: "Minimalkan pemutar" });
  await expect(minimize).toHaveCount(1);
  await expect(minimize.locator("svg")).toHaveCount(1);
  const controlBox = await minimize.boundingBox();
  expect(controlBox).not.toBeNull();
  expect(controlBox!.width).toBeGreaterThanOrEqual(44);
  expect(controlBox!.height).toBeGreaterThanOrEqual(44);
  await minimize.click();
  await expect(page.locator(".media-surface.is-minimized")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("gys-media-minimized")),
    )
    .toBe("1");
  const restore = page.getByRole("button", { name: "Perbesar pemutar" });
  await expect(restore.locator("svg")).toHaveCount(1);
  await restore.click();
  await expect(page.locator(".media-surface")).not.toHaveClass(/is-minimized/);
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("gys-media-minimized")),
    )
    .toBe("0");
});

test("phone ignores a stale dragged position and keeps dock above bottom navigation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "gys-media-position-v1",
      JSON.stringify({ left: 8, top: 8 }),
    );
    localStorage.setItem("gys-media-minimized", "0");
  });
  await openSpeechPlayerAtDesktop(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const media = await expectCentered(page, 390);
  const nav = await page.locator(".navigation-shell").boundingBox();
  expect(nav).not.toBeNull();
  expect(media.y + media.height).toBeLessThanOrEqual(nav!.y);
});

test("tablet uses stable centered dock geometry after resize", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.removeItem("gys-media-position-v1"),
  );
  await openSpeechPlayerAtDesktop(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  const media = await expectCentered(page, 768);
  expect(media.x).toBeGreaterThanOrEqual(12);
  expect(media.x + media.width).toBeLessThanOrEqual(756);
});
