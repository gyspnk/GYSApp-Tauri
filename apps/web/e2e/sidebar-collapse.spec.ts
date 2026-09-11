import { expect, test } from "@playwright/test";

test("desktop sidebar collapses, persists, and stays accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/GYSApp-Tauri/");
  const nav = page.locator(".navigation-shell");
  const expanded = await nav.boundingBox();
  expect(expanded).not.toBeNull();
  expect(expanded!.width).toBeGreaterThan(200);

  const collapse = page.getByRole("button", { name: "Ciutkan navigasi" });
  await expect(collapse).toBeVisible();
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  const controlBox = await collapse.boundingBox();
  expect(controlBox).not.toBeNull();
  expect(controlBox!.width).toBeGreaterThanOrEqual(44);
  expect(controlBox!.height).toBeGreaterThanOrEqual(44);
  await collapse.click();

  await expect(page.locator(".workspace")).toHaveClass(/is-sidebar-collapsed/);
  const collapsed = await nav.boundingBox();
  expect(collapsed).not.toBeNull();
  expect(collapsed!.width).toBeLessThan(100);
  await expect(
    page.getByRole("button", { name: "Perluas navigasi" }),
  ).toHaveAttribute("aria-expanded", "false");

  await page.reload();
  await expect(page.locator(".workspace")).toHaveClass(/is-sidebar-collapsed/);
  await expect(
    page.getByRole("button", { name: "Perluas navigasi" }),
  ).toBeVisible();
});

test("desktop collapse preference does not replace mobile bottom navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem("gys-sidebar-collapsed-v1", "1"),
  );
  await page.goto("/GYSApp-Tauri/");
  await expect(page.getByRole("button", { name: /navigasi/i })).toHaveCount(0);
  const nav = page.locator(".navigation-shell");
  const box = await nav.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(360);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
});
