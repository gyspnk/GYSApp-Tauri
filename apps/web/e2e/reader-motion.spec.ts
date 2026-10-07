import { expect, test } from "@playwright/test";
import { preparePinnedReaderAssets } from "./pinned-reader-fixtures.js";

for (const width of [390, 768, 1440]) {
  test(`verse navigation has one animation layer and never replays its entrance (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
    await expect(page.locator(".lyrics-sheet")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const animations = await page.evaluate(
      () =>
        new Promise<
          Array<{ name: string; pseudo: string | null; target: string }>
        >((resolve) => {
          const seen = new Set<Animation>();
          const animations: Array<{
            name: string;
            pseudo: string | null;
            target: string;
          }> = [];
          const start = performance.now();
          const sample = () => {
            for (const animation of document.getAnimations()) {
              if (seen.has(animation) || !(animation instanceof CSSAnimation))
                continue;
              seen.add(animation);
              const effect = animation.effect as KeyframeEffect;
              animations.push({
                name: animation.animationName,
                pseudo: effect.pseudoElement,
                target:
                  effect.target instanceof Element
                    ? effect.target.className
                    : "",
              });
            }
            if (performance.now() - start < 900) requestAnimationFrame(sample);
            else resolve(animations);
          };
          document
            .querySelector<HTMLButtonElement>('[aria-label="Bait berikutnya"]')!
            .click();
          requestAnimationFrame(sample);
        }),
    );
    expect(
      animations.filter((entry) =>
        /^(fade-in|verse-in-|hymn-surface-fade-in)/.test(entry.name),
      ),
    ).toEqual([]);
    expect(
      animations.filter((entry) => entry.name === "hymn-lyrics-in"),
    ).toHaveLength(1);
    expect(
      animations.filter((entry) => entry.name === "hymn-lyrics-out"),
    ).toHaveLength(1);
    expect(
      animations.filter(
        (entry) =>
          entry.name.startsWith("reader-content-") ||
          entry.name.startsWith("-ua-view-transition-fade"),
      ),
    ).toEqual([]);
    await expect(page.locator(".lyrics-sheet")).toHaveAttribute(
      "aria-label",
      /bait 2$/,
    );
    await expect(page.locator("html")).not.toHaveClass(/is-reader-transition/);
    await page
      .getByRole("button", { name: "Bait sebelumnya", exact: true })
      .click();
    await expect(page.locator(".lyrics-sheet")).toHaveAttribute(
      "aria-label",
      /bait 1$/,
    );
    await expect(page.locator("html")).not.toHaveClass(/is-reader-transition/);
    expect(
      await page
        .locator(".lyrics-sheet")
        .evaluate((node) => node.getAnimations().length),
    ).toBe(0);
  });
}

test("browsers without snapshots use a single lyric entrance", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, "startViewTransition", {
      value: undefined,
    });
  });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  await expect(page.locator(".lyrics-sheet")).toBeVisible();
  await page
    .getByRole("button", { name: "Bait berikutnya", exact: true })
    .click();
  await expect(page.locator(".lyrics-sheet")).toHaveAttribute(
    "aria-label",
    /bait 2$/,
  );
  expect(
    await page
      .locator(".route-view")
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");
  expect(
    await page
      .locator(".hymn-detail-surface")
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");
  expect(
    await page
      .locator(".lyrics-sheet")
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("verse-in-next");
  await page
    .getByRole("button", { name: "Bait sebelumnya", exact: true })
    .click();
  await expect(page.locator(".lyrics-sheet")).toHaveAttribute(
    "aria-label",
    /bait 1$/,
  );
});

test("chord toggle preserves lyrics and animates row spacing in both directions", async ({
  page,
}) => {
  await preparePinnedReaderAssets(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  await page
    .getByRole("button", { name: "Tampilkan chord", exact: true })
    .click();
  const line = page.locator(".chord-rich-line").first();
  await expect(line).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(() => line.evaluate((el) => el.getAnimations().length))
    .toBe(0);
  await line.evaluate((el) =>
    el.setAttribute("data-motion-probe", "preserved"),
  );
  for (const hide of [true, false]) {
    const movement = await page
      .getByRole("button", {
        name: hide ? "Sembunyikan chord" : "Tampilkan chord",
        exact: true,
      })
      .evaluate(
        (button) =>
          new Promise<{ padding: number; font: number; duration: number }>(
            (resolve, reject) => {
              const el = document.querySelector<HTMLElement>(
                '[data-motion-probe="preserved"]',
              )!;
              let frames = 0;
              const sample = () => {
                const transition = el
                  .getAnimations()
                  .find(
                    (animation) =>
                      animation instanceof CSSTransition &&
                      animation.transitionProperty === "padding-top",
                  );
                if (!transition) {
                  if (++frames < 60) requestAnimationFrame(sample);
                  else
                    reject(new Error("Chord spacing transition did not start"));
                  return;
                }
                // Freeze at creation, before any browser protocol round trip can
                // consume the animation on a busy runner. Verify both directions.
                const duration = Number(
                  transition.effect!.getTiming().duration,
                );
                transition.pause();
                transition.currentTime = duration / 2;
                const style = getComputedStyle(el);
                resolve({
                  padding: parseFloat(style.paddingTop),
                  font: parseFloat(style.fontSize),
                  duration,
                });
              };
              (button as HTMLElement).click();
              requestAnimationFrame(sample);
            },
          ),
      );
    await expect(line).toHaveAttribute("data-motion-probe", "preserved");
    expect(movement.duration).toBeGreaterThan(0);
    expect(movement.padding).toBeGreaterThan(0);
    expect(movement.padding).toBeLessThan(movement.font * 1.25);
    await line.evaluate((el) => {
      for (const animation of el.getAnimations()) animation.play();
    });
    if (hide) {
      await expect
        .poll(() =>
          line.evaluate((el) => parseFloat(getComputedStyle(el).paddingTop)),
        )
        .toBe(0);
      await expect(page.locator(".chord-capability.is-hidden")).toHaveCount(4);
    } else {
      await expect
        .poll(() =>
          line.evaluate((el) => parseFloat(getComputedStyle(el).paddingTop)),
        )
        .toBeGreaterThan(15);
    }
  }
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`verse and hymn navigation remain usable with motion ${reducedMotion}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
    await page
      .getByRole("button", { name: "Bait berikutnya", exact: true })
      .click();
    await expect(page.locator(".lyrics-sheet")).toHaveAttribute(
      "aria-label",
      /bait 2$/,
    );
    await page
      .getByRole("button", { name: "Bait sebelumnya", exact: true })
      .click();
    await expect(page.locator(".lyrics-sheet")).toHaveAttribute(
      "aria-label",
      /bait 1$/,
    );
    await page.getByRole("button", { name: "Berikutnya", exact: true }).click();
    await expect(page).toHaveURL(/hymn-002/);
    await expect(page.locator(".lyrics-sheet")).toBeVisible();
  });
}
