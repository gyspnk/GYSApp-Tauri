import { expect, test } from "@playwright/test";

test("back navigation cancels a link still waiting for a cold route", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "connection", {
      value: { saveData: true },
    }),
  );
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/faith-[^/]+\.js$/, async (route) => {
    await pending;
    await route.continue();
  });
  await page.goto("/GYSApp-Tauri/");
  await page.locator('.primary-nav a[href$="/kidung"]').click();
  await expect(page.locator(".hymn-page")).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/is-reader-transition/);
  const loading = page.waitForRequest(/\/faith-[^/]+\.js$/);
  await page.locator('.primary-nav a[href$="/iman"]').click();
  await loading;
  await page.goBack();
  release();
  await expect(page.locator(".home-grid")).toBeVisible();
  await page.waitForTimeout(250);
  await expect(page).toHaveURL(/GYSApp-Tauri\/$/);
});

test("history arrivals keep the same page motion after multiple route changes", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.addInitScript(() => {
    const original = Element.prototype.animate;
    const arrivals: Array<{ duration: unknown; frames: unknown }> = [];
    (window as unknown as { pageArrivals: typeof arrivals }).pageArrivals =
      arrivals;
    Element.prototype.animate = function (frames, options) {
      if (this.classList.contains("route-view"))
        arrivals.push({
          duration: typeof options === "object" ? options.duration : options,
          frames,
        });
      return original.call(this, frames, options);
    };
  });
  await page.goto("/GYSApp-Tauri/");
  for (const [path, selector] of [
    ["iman", ".faith-page"],
    ["kidung", ".hymn-page"],
  ]) {
    await page.locator(`.primary-nav a[href$="/${path}"]`).click();
    await expect(page.locator(selector!)).toBeVisible();
    await expect(page.locator("html")).not.toHaveClass(/is-reader-transition/);
  }
  await page.evaluate(() => {
    (window as unknown as { pageArrivals: unknown[] }).pageArrivals.length = 0;
  });
  await page.goBack();
  await expect(page.locator(".faith-page")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { pageArrivals: unknown[] }).pageArrivals,
      ),
    )
    .toEqual([{ duration: 260, frames: [{ opacity: 0 }, { opacity: 1 }] }]);
  await page.evaluate(() => {
    (window as unknown as { pageArrivals: unknown[] }).pageArrivals.length = 0;
  });
  await page.getByRole("button", { name: "Cari di seluruh aplikasi" }).click();
  await page
    .getByLabel("Cari Alkitab, Kidung, Literatur, Iman, atau media")
    .fill("Pujilah Allah Yang Maha Esa");
  await page
    .getByRole("button", { name: /Pujilah Allah Yang Maha Esa/ })
    .first()
    .click();
  await expect(page.locator(".hymn-detail-page")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { pageArrivals: unknown[] }).pageArrivals,
      ),
    )
    .toEqual([{ duration: 260, frames: [{ opacity: 0 }, { opacity: 1 }] }]);
});

test("navigation without native snapshots fades once with no legacy entrance", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.addInitScript(() => {
    Object.defineProperty(document, "startViewTransition", {
      value: undefined,
    });
    const original = Element.prototype.animate;
    const samples: Array<{ css: number; duration: unknown }> = [];
    (window as unknown as { fallbackPages: typeof samples }).fallbackPages =
      samples;
    Element.prototype.animate = function (frames, options) {
      if (this.classList.contains("route-view"))
        samples.push({
          css: this.getAnimations().filter(
            (animation) => animation instanceof CSSAnimation,
          ).length,
          duration: typeof options === "object" ? options.duration : options,
        });
      return original.call(this, frames, options);
    };
  });
  await page.goto("/GYSApp-Tauri/");
  await page.locator('.primary-nav a[href$="/iman"]').click();
  await expect(page.locator(".faith-page")).toBeVisible();
  await page.locator('.primary-nav a[href$="/kidung"]').click();
  await expect(page.locator(".hymn-page")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { fallbackPages: unknown[] }).fallbackPages,
      ),
    )
    .toEqual([
      { css: 0, duration: 260 },
      { css: 0, duration: 260 },
    ]);
});

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
