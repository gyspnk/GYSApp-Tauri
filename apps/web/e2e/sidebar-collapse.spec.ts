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

  const collapse = page.getByRole("button", { name: "Ciutkan navigasi" });
  await expect(collapse).toBeVisible();
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  const controlBox = await collapse.boundingBox();
  expect(controlBox).not.toBeNull();
  expect(controlBox!.width).toBeGreaterThanOrEqual(44);
  expect(controlBox!.height).toBeGreaterThanOrEqual(44);
  expect(controlBox!.y).toBeCloseTo(topbar!.y + topbar!.height + 4, 0);
  expect(controlBox!.x).toBeGreaterThanOrEqual(expanded!.x);
  expect(controlBox!.x + controlBox!.width).toBeLessThanOrEqual(
    expanded!.x + expanded!.width,
  );
  const firstItem = await nav.locator(".nav-item").first().boundingBox();
  expect(controlBox!.y + controlBox!.height).toBeLessThanOrEqual(firstItem!.y);
  const expandedItem = await nav.locator(".nav-item.is-active").boundingBox();
  expect(expandedItem).not.toBeNull();
  const icon = (await nav.locator(".nav-item.is-active > svg").boundingBox())!;
  await collapse.evaluate((element) => (element as HTMLButtonElement).click());

  const inFlight = await page.evaluate(
    () =>
      new Promise<
        Array<{
          navWidth: number;
          itemWidth: number;
          iconX: number;
          toggleX: number;
        }>
      >((resolve) => {
        const frames: Array<{
          navWidth: number;
          itemWidth: number;
          iconX: number;
          toggleX: number;
        }> = [];
        const started = performance.now();
        const sample = () => {
          const icon = document
            .querySelector(".navigation-shell .nav-item.is-active > svg")!
            .getBoundingClientRect();
          const toggle = document
            .querySelector(".sidebar-collapse-toggle")!
            .getBoundingClientRect();
          frames.push({
            iconX: icon.x + icon.width / 2,
            toggleX: toggle.x + toggle.width / 2,
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
  for (const frame of inFlight) {
    expect(Math.abs(frame.iconX - icon.x - icon.width / 2)).toBeLessThan(1);
    expect(
      Math.abs(frame.toggleX - controlBox!.x - controlBox!.width / 2),
    ).toBeLessThan(1);
  }

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
  expect(collapsedControlBox!.x).toBeGreaterThanOrEqual(collapsed!.x);
  expect(
    collapsedControlBox!.x + collapsedControlBox!.width,
  ).toBeLessThanOrEqual(collapsed!.x + collapsed!.width);
  await page.reload();
  await expect(page.locator(".workspace")).toHaveClass(/is-sidebar-collapsed/);
  await expect(
    page.getByRole("button", { name: "Perluas navigasi" }),
  ).toBeVisible();
});

test("home sidebar reverses smoothly without moving icons, controls, or scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/");
  await expect(page.locator(".home-grid")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => scrollTo({ top: 100, behavior: "instant" }));
  const frames = await page.evaluate(
    () =>
      new Promise<
        Array<{
          width: number;
          iconX: number;
          toggleX: number;
          y: number;
          scroll: number;
          overflow: number;
        }>
      >((resolve) => {
        const toggle = document.querySelector<HTMLButtonElement>(
          ".sidebar-collapse-toggle",
        )!;
        const frames: Array<{
          width: number;
          iconX: number;
          toggleX: number;
          y: number;
          scroll: number;
          overflow: number;
        }> = [];
        const started = performance.now();
        const sample = () => {
          const nav = document
            .querySelector(".navigation-shell")!
            .getBoundingClientRect();
          const icon = document
            .querySelector(".nav-item.is-active > svg")!
            .getBoundingClientRect();
          const button = toggle.getBoundingClientRect();
          frames.push({
            width: nav.width,
            iconX: icon.x + icon.width / 2,
            toggleX: button.x + button.width / 2,
            y: button.y,
            scroll: scrollY,
            overflow: document.documentElement.scrollWidth - innerWidth,
          });
          if (performance.now() - started < 550) requestAnimationFrame(sample);
          else resolve(frames);
        };
        sample();
        toggle.click();
        setTimeout(() => toggle.click(), 50);
        setTimeout(() => toggle.click(), 110);
      }),
  );
  expect(frames.some((frame) => frame.width > 85 && frame.width < 200)).toBe(
    true,
  );
  expect(frames.at(-1)!.width).toBeCloseTo(80, 0);
  for (const frame of frames) {
    expect(frame.width).toBeGreaterThanOrEqual(79);
    expect(frame.width).toBeLessThanOrEqual(209);
    expect(Math.abs(frame.iconX - frames[0]!.iconX)).toBeLessThan(1);
    expect(Math.abs(frame.toggleX - frames[0]!.toggleX)).toBeLessThan(1);
    expect(Math.abs(frame.y - frames[0]!.y)).toBeLessThan(1);
    expect(Math.abs(frame.scroll - frames[0]!.scroll)).toBeLessThan(2);
    expect(frame.overflow).toBeLessThanOrEqual(1);
  }
  await page
    .getByRole("button", { name: "Perluas navigasi", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator(".navigation-shell")
        .evaluate((node) => node.getBoundingClientRect().width),
    )
    .toBeCloseTo(208, 0);
  await page.setViewportSize({ width: 768, height: 800 });
  await expect(page.locator(".sidebar-collapse-toggle")).toBeHidden();
  await expect(page.locator(".nav-item.is-active .nav-copy")).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 600 });
  await expect(
    page.getByRole("button", { name: "Ciutkan navigasi", exact: true }),
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

test("desktop navigation remains reachable while long content scrolls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto("/GYSApp-Tauri/iman");
  await expect(page.locator(".faith-row")).toHaveCount(10);
  const nav = page.locator(".navigation-shell");
  const initial = (await nav.boundingBox())!;
  await page.evaluate(() => scrollTo({ top: 1200, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(300);
  expect(
    Math.abs((await nav.boundingBox())!.y - initial.y),
  ).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Ciutkan navigasi" }).click();
  await expect
    .poll(async () => (await nav.boundingBox())!.width)
    .toBeLessThan(100);
  expect(
    Math.abs((await nav.boundingBox())!.y - initial.y),
  ).toBeLessThanOrEqual(1);
  for (const link of await nav.locator(".nav-item").all()) {
    const box = (await link.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(initial.y);
    expect(box.y + box.height).toBeLessThanOrEqual(600);
  }
  await page.getByRole("button", { name: "Perluas navigasi" }).click();
  await expect
    .poll(async () => (await nav.boundingBox())!.width)
    .toBeGreaterThan(200);
});
