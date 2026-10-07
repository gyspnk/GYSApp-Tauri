import { expect, test } from "@playwright/test";

test("navigation from a scrolled catalog starts the destination at its top", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 850 });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/kidung");
  await expect(page.locator(".pujian-list > li").first()).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 700, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(700);
  await page.locator('.primary-nav a[href$="/iman"]').click();
  await expect(page.locator(".faith-page")).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/is-reader-transition/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
});

test("navigation snapshots only page content and rapid taps end on the latest route", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.addInitScript(() => {
    const original = document.startViewTransition.bind(document);
    const samples: string[] = [];
    (window as unknown as { transitions: string[] }).transitions = samples;
    document.startViewTransition = (update) => {
      samples.push(
        getComputedStyle(document.querySelector(".route-view")!)
          .viewTransitionName,
      );
      return original(update);
    };
  });
  await page.goto("/GYSApp-Tauri/");
  await expect(page.locator(".primary-nav")).toBeVisible();
  // Pointer intent warms these modules before the tap, as in normal navigation.
  await page.locator('.primary-nav a[href$="/iman"]').hover();
  await page.locator('.primary-nav a[href$="/bible"]').hover();
  await page.evaluate(() => {
    document
      .querySelector<HTMLAnchorElement>('.primary-nav a[href$="/iman"]')!
      .click();
    document
      .querySelector<HTMLAnchorElement>('.primary-nav a[href$="/bible"]')!
      .click();
  });
  await expect(page).toHaveURL(/\/bible$/);
  await expect(page.locator(".bible-page")).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { transitions: string[] }).transitions,
    ),
  ).toEqual(["app-page"]);
  await expect(page.locator("html")).not.toHaveClass(/is-reader-transition/);
  await expect(page.locator('.primary-nav a[href$="/bible"]')).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.goBack();
  await expect(page).toHaveURL(/GYSApp-Tauri\/$/);
  expect(failures).toEqual([]);
});

test("reduced motion navigation stays immediate without capturing snapshots", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.addInitScript(() => {
    document.startViewTransition = () => {
      throw new Error("Reduced motion must not snapshot");
    };
  });
  await page.goto("/GYSApp-Tauri/");
  await page.locator('.primary-nav a[href$="/iman"]').click();
  await expect(page).toHaveURL(/\/iman$/);
  await expect(page.locator(".faith-page")).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/is-reader-transition/);
});
