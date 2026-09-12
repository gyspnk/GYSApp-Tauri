import { expect, test, type Page } from "@playwright/test";

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((selected) => {
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({ version: 1, locale: "id", theme: selected }),
    );
    localStorage.setItem("gys-theme", selected);
  }, theme);
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    )
    .toBe(true);
}

test("desktop light shell is compact, stable, and uses reachable controls", async ({
  page,
}) => {
  await setTheme(page, "light");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/GYSApp-Tauri/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expectNoHorizontalOverflow(page);
  const collapse = page.getByRole("button", { name: "Ciutkan navigasi" });
  const box = await collapse.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator(".topbar")).toHaveCSS("box-shadow", "none");
  await page.screenshot({
    path: "test-results/ux-light-desktop.png",
    fullPage: true,
  });
});

test("dark tablet uses a compact labelled rail without bleeding into content", async ({
  page,
}) => {
  await setTheme(page, "dark");
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/GYSApp-Tauri/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expectNoHorizontalOverflow(page);
  const nav = await page.locator(".navigation-shell").boundingBox();
  expect(nav).not.toBeNull();
  expect(nav!.width).toBeLessThanOrEqual(96);
  const navCopy = page.locator(".navigation-shell .nav-copy").first();
  await expect(navCopy).toBeVisible();
  const labelSize = await navCopy.locator("strong").evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  expect(labelSize).toBeGreaterThanOrEqual(11);
  await expect(
    page.locator(".navigation-shell .nav-item").first(),
  ).toHaveAttribute("aria-label", /.+/);
  await page.screenshot({
    path: "test-results/ux-dark-tablet.png",
    fullPage: true,
  });
});

test("phone composition remains contained above bottom navigation", async ({
  page,
}) => {
  await setTheme(page, "light");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/");
  await expectNoHorizontalOverflow(page);
  const nav = await page.locator(".navigation-shell").boundingBox();
  expect(nav).not.toBeNull();
  expect(nav!.x).toBeGreaterThanOrEqual(0);
  expect(nav!.x + nav!.width).toBeLessThanOrEqual(390);
  expect(nav!.y + nav!.height).toBeLessThanOrEqual(844);
  await page.screenshot({
    path: "test-results/ux-light-phone.png",
    fullPage: true,
  });
});

test("reduced motion removes shell and dock transitions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/GYSApp-Tauri/");
  await expect(page.locator(".workspace")).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await expect(page.locator(".sidebar-collapse-toggle")).toHaveCSS(
    "transition-duration",
    "0s",
  );
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    ),
  ).toBe("auto");
});
