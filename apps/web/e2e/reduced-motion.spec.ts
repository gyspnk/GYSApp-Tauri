import { expect, test } from "@playwright/test";

// Reduced motion is a promise the whole shell makes, but every existing test
// checks one element it happens to know about. A new entrance animation added
// without a guard would pass all of them. This walks every route and asks the
// browser which animations are actually running.
const SURFACES = [
  { path: "/", ready: ".home-portals" },
  { path: "/kidung", ready: ".pujian-list > li" },
  { path: "/kidung/hymn-001", ready: ".hymn-text-title h1" },
  { path: "/bible?book=kejadian&chapter=1", ready: ".verse-content" },
  { path: "/literatur", ready: ".page-intro h1" },
  { path: "/iman", ready: ".faith-rows" },
  { path: "/lainnya", ready: ".more-settings-list" },
];

// Serialised into the page, so it must not close over anything in this module.
const runningAnimations = () => {
  const running: { node: string; name: string; seconds: number }[] = [];
  for (const element of document.querySelectorAll("body *")) {
    const style = getComputedStyle(element);
    if (style.animationName === "none") continue;
    const durations = style.animationDuration
      .split(",")
      .map((value) => Number.parseFloat(value) || 0);
    const delays = style.animationDelay
      .split(",")
      .map((value) => Number.parseFloat(value) || 0);
    const longest = Math.max(
      ...durations.map((value, index) => value + (delays[index] ?? 0)),
    );
    // A 50 ms fade is not motion; anything longer is.
    if (longest <= 0.05) continue;
    running.push({
      node: `${element.tagName.toLowerCase()}.${[...element.classList]
        .join(".")
        .slice(0, 32)}`,
      name: style.animationName,
      seconds: longest,
    });
  }
  return running.slice(0, 8);
};

for (const width of [390, 1440]) {
  test(`no route animates when the reader asks for reduced motion at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    // `test.use({ reducedMotion })` does not reach this context (the config
    // builds it from the project options), so emulate on the page itself.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      localStorage.setItem(
        "gys-shell-settings-v1",
        JSON.stringify({
          version: 1,
          locale: "id",
          theme: "light",
          onboarded: true,
        }),
      );
    });
    await page.route(/^https:\/\//, (route) => route.abort());

    for (const surface of SURFACES) {
      await page.goto(`/GYSApp-Tauri${surface.path}`);
      await expect(page.locator(surface.ready).first()).toBeVisible();
      // Entrances start on mount and on data arrival; sample after both.
      await page.waitForTimeout(900);
      expect(
        await page.evaluate(runningAnimations),
        `animations still running on ${surface.path}`,
      ).toEqual([]);
    }
  });
}
