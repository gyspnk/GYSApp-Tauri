import { expect, test } from "@playwright/test";

test("desktop sidebar collapses, persists, and stays accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/GYSApp-Tauri/");
  const nav = page.locator(".navigation-shell");
  const expanded = await nav.boundingBox();
  const topbar = await page.locator(".topbar").boundingBox();
  expect(expanded).not.toBeNull();
  expect(topbar).not.toBeNull();
  expect(expanded!.width).toBeGreaterThan(200);
  expect(expanded!.y).toBeCloseTo(topbar!.y + topbar!.height, 0);

  const motionContract = await page
    .locator(".workspace")
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        duration: style.getPropertyValue("--sidebar-motion-duration").trim(),
        easing: style.getPropertyValue("--sidebar-motion-ease").trim(),
      };
    });
  expect(Number.parseFloat(motionContract.duration)).toBeCloseTo(0.24, 2);
  expect(motionContract.easing).toContain("cubic-bezier(.22, 1, .36, 1)");

  const collapse = page.getByRole("button", { name: "Ciutkan navigasi" });
  await expect(collapse).toBeVisible();
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  const controlBox = await collapse.boundingBox();
  expect(controlBox).not.toBeNull();
  expect(controlBox!.width).toBeGreaterThanOrEqual(44);
  expect(controlBox!.height).toBeGreaterThanOrEqual(44);
  expect(controlBox!.y).toBeCloseTo(topbar!.y + topbar!.height, 0);
  expect(
    Math.abs(controlBox!.x - (expanded!.x + expanded!.width)),
  ).toBeLessThanOrEqual(1);
  const expandedItem = await nav.locator(".nav-item.is-active").boundingBox();
  expect(expandedItem).not.toBeNull();
  await collapse.evaluate((element) => (element as HTMLButtonElement).click());

  const inFlight = await page.evaluate(
    () =>
      new Promise<Array<{ navWidth: number; itemWidth: number }>>((resolve) => {
        const frames: Array<{ navWidth: number; itemWidth: number }> = [];
        const started = performance.now();
        const sample = () => {
          frames.push({
            navWidth:
              document
                .querySelector<HTMLElement>(".navigation-shell")
                ?.getBoundingClientRect().width ?? 0,
            itemWidth:
              document
                .querySelector<HTMLElement>(
                  ".navigation-shell .nav-item.is-active",
                )
                ?.getBoundingClientRect().width ?? 0,
          });
          if (performance.now() - started < 320) {
            requestAnimationFrame(sample);
          } else {
            resolve(frames);
          }
        };
        requestAnimationFrame(sample);
      }),
  );
  expect(
    inFlight.some(
      (frame) =>
        frame.navWidth > 80 &&
        frame.navWidth < expanded.width &&
        frame.itemWidth >= 44 &&
        frame.itemWidth < expandedItem!.width,
    ),
  ).toBe(true);

  await expect(page.locator(".workspace")).toHaveClass(/is-sidebar-collapsed/);
  await expect
    .poll(() =>
      nav.evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBeLessThan(100);
  await expect
    .poll(async () => {
      const [collapsedNavBox, activeItemBox] = await Promise.all([
        nav.boundingBox(),
        nav.locator(".nav-item.is-active").boundingBox(),
      ]);
      return Boolean(
        collapsedNavBox &&
        activeItemBox &&
        activeItemBox.x >= collapsedNavBox.x &&
        activeItemBox.x + activeItemBox.width <=
          collapsedNavBox.x + collapsedNavBox.width + 1,
      );
    })
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Perluas navigasi" }),
  ).toHaveAttribute("aria-expanded", "false");
  const collapsed = await nav.boundingBox();
  const expand = page.getByRole("button", { name: "Perluas navigasi" });
  const collapsedControlBox = await expand.boundingBox();
  expect(collapsed).not.toBeNull();
  expect(collapsedControlBox).not.toBeNull();
  expect(
    Math.abs(collapsedControlBox!.x - (collapsed!.x + collapsed!.width)),
  ).toBeLessThanOrEqual(1);

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
