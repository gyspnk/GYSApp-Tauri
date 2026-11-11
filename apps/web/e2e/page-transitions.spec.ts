import { expect, test } from "@playwright/test";

// These tests sample animation frames and route swaps; a shard-loaded runner
// needs more than the default 30 s before the wall-clock assertions mean
// anything.
test.describe.configure({ timeout: 90_000 });

test("back navigation cancels a link still waiting for a cold route", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "connection", {
      value: { saveData: true },
    }),
  );
  // A cold link only stays pending for PRELOAD_BUDGET_MS (180 ms, see
  // route-transitions.ts). A Back issued from the driver must cross Node and
  // CDP first; under load that outlasted the budget, the click committed to
  // /iman, and the pop then walked back to /kidung. The shell's promise is
  // conditional on ordering, not wall clock: a popstate that arrives while
  // the link is still pending bumps the generation counter and the click
  // never navigates. So hold time still around the click and the back, and
  // wait for the popstate event itself: the cancellation has already run when
  // the clock resumes and the held chunk is released. The clock is installed
  // only now, after boot, because fake timers from document start disturb the
  // deferred route-transitions import and the first navigation.
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/faith-[^/]+\.js$/, async (route) => {
    await pending;
    await route.continue();
  });
  await page.goto("/GYSApp-Tauri/");
  // The shell imports route-transitions.ts after boot; a click before that
  // install gets the anchor's default full document navigation, which reloads
  // /kidung cold and occasionally outruns the 5 s expect. The class is set
  // synchronously by installRouteTransitions, so wait for it.
  await expect(page.locator("html")).toHaveClass(/has-route-transitions/);
  await page.locator('.primary-nav a[href$="/kidung"]').click();
  await expect(page.locator(".hymn-page")).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/is-reader-transition/);
  await page.clock.pauseAt(Date.now() + 1_000);
  const loading = page.waitForRequest(/\/faith-[^/]+\.js$/);
  // `locator.click()` waits on animation frames, which a paused clock never
  // paints, so the link is activated from inside the page.
  await page.evaluate(() => {
    document
      .querySelector<HTMLAnchorElement>('.primary-nav a[href$="/iman"]')!
      .click();
  });
  await loading;
  await page.evaluate(() => {
    (window as unknown as { __popped: Promise<string> }).__popped = new Promise(
      (resolve) => {
        addEventListener("popstate", () => resolve(location.pathname), {
          once: true,
        });
      },
    );
  });
  await page.goBack();
  expect(
    await page.evaluate(
      () => (window as unknown as { __popped: Promise<string> }).__popped,
    ),
  ).toBe("/GYSApp-Tauri/");
  await page.clock.resume();
  release();
  await expect(page.locator(".home-grid")).toBeVisible();
  await page.waitForTimeout(250);
  await expect(page).toHaveURL(/GYSApp-Tauri\/$/);
});

test("a cancelled pending navigation still lets the next click push history", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "connection", {
      value: { saveData: true },
    }),
  );
  // Same cancellation as the test above, then one more click. The shell used
  // to keep its "navigation in flight" flag after a cancelled navigation, so
  // the next click was issued with replace: true and silently overwrote the
  // history entry instead of pushing a new one.
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/faith-[^/]+\.js$/, async (route) => {
    await pending;
    await route.continue();
  });
  await page.goto("/GYSApp-Tauri/");
  await expect(page.locator("html")).toHaveClass(/has-route-transitions/);
  await page.locator('.primary-nav a[href$="/kidung"]').click();
  await expect(page.locator(".hymn-page")).toBeVisible();
  await page.clock.pauseAt(Date.now() + 1_000);
  const loading = page.waitForRequest(/\/faith-[^/]+\.js$/);
  await page.evaluate(() => {
    document
      .querySelector<HTMLAnchorElement>('.primary-nav a[href$="/iman"]')!
      .click();
  });
  await loading;
  await page.goBack();
  await expect(page).toHaveURL(/GYSApp-Tauri\/$/);
  await page.clock.resume();
  release();
  await expect(page.locator(".home-grid")).toBeVisible();
  // React Router records its entry index in history.state. history.length is
  // not usable here: this driver's browsing context reports the same length
  // for a push and a replace, while the index tells them apart — verified by
  // removing the fix, which turned this assertion red with idx unchanged.
  const entryIndex = () =>
    page.evaluate(() => (history.state as { idx?: number } | null)?.idx ?? -1);
  const before = await entryIndex();
  await page.locator('.primary-nav a[href$="/bible"]').click();
  await expect(page).toHaveURL(/GYSApp-Tauri\/bible/);
  expect(
    await entryIndex(),
    "the next click pushes instead of replacing the history entry",
  ).toBe(before + 1);
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
    .not.toEqual([]);
  const fallback = await page.evaluate(
    () =>
      (
        window as unknown as {
          fallbackPages: Array<{ css: number; duration: number }>;
        }
      ).fallbackPages,
  );
  // Each smooth navigation fades the incoming view (260ms) only; waiting for
  // the outgoing view to fade first added ~110ms to every click, so the swap
  // happens immediately and the new page eases in. A legacy CSS entrance must
  // never run alongside it.
  expect(fallback.every((sample) => sample.css === 0)).toBe(true);
  expect(new Set(fallback.map((sample) => sample.duration))).toEqual(
    new Set([260]),
  );
  expect(fallback.length).toBeGreaterThanOrEqual(2);
});

test("navigation from a scrolled catalog starts the destination at its top", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 850 });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/kidung");
  await expect(page.locator(".pujian-list > li").first()).toBeVisible();
  // The catalogue paints 14 rows first and grows in idle batches, so the page
  // must be tall enough before a 700 px scroll means anything.
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight))
    .toBeGreaterThan(1_600);
  await page.evaluate(() => window.scrollTo({ top: 700, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(700);
  await page.locator('.primary-nav a[href$="/iman"]').click();
  await expect(page.locator(".faith-page")).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/is-reader-transition/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
});

test("page navigation skips document snapshots and rapid taps end on the latest route", async ({
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
  // Page navigation cross-fades the route view; a document snapshot is only
  // used for reader surfaces, so rapid taps must not capture one at all.
  expect(
    await page.evaluate(
      () => (window as unknown as { transitions: string[] }).transitions,
    ),
  ).toEqual([]);
  await expect(page.locator("html")).not.toHaveClass(/is-reader-transition/);
  await expect(page.locator('.primary-nav a[href$="/bible"]')).toHaveAttribute(
    "aria-current",
    "page",
  );
  // Primary navigation is a plain link, so each tap keeps its own history
  // entry; only reader transitions collapse a tap into the pending one.
  // Asserting a single entry here would test a promise the shell never made.
  await page.goBack();
  await expect(page).toHaveURL(/\/(iman|GYSApp-Tauri\/)$/);
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
