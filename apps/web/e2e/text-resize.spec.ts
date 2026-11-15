import { expect, test } from "@playwright/test";

// WCAG 1.4.4 asks that text can grow to 200 % without losing content or
// function. The shell is rem-based, so doubling the root size is the honest
// simulation; only the settings panel had a contract for it, and every other
// surface was assumed to follow.
const SURFACES = [
  { path: "/", ready: ".home-portals" },
  { path: "/kidung", ready: ".pujian-list > li" },
  { path: "/kidung/hymn-001", ready: ".hymn-text-title h1" },
  { path: "/bible?book=kejadian&chapter=1", ready: ".verse-content" },
  { path: "/literatur", ready: ".page-intro h1" },
  { path: "/suara", ready: ".page-intro h1" },
  { path: "/iman", ready: ".faith-rows" },
  { path: "/lainnya", ready: ".more-settings-list" },
];

test("every surface survives 200 % text without sideways scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
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
    await expect(page.locator(surface.ready).first()).toBeVisible({
      timeout: 30_000,
    });
    // Doubling the root also re-lays the page, so read after the frame that
    // follows the change rather than in the same task.
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
    });
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }),
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    );
    expect(
      overflow,
      `${surface.path} scrolls sideways at 200 % text`,
    ).toBeLessThanOrEqual(1);
    // The content is still there: the ready node has a real box.
    const box = await page.locator(surface.ready).first().boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
  }
});

test("the hymn action captions survive 200 % text without clipping", async ({
  page,
}) => {
  // The more-actions panel gives every action one of five equal columns, so at
  // 200 % "Favorit" was cut to three letters. The caption wraps and the button
  // grows instead; the row may get taller, the words stay whole.
  await page.setViewportSize({ width: 390, height: 844 });
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
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(page.locator(".hymn-text-title h1")).toBeVisible({
    timeout: 30_000,
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });
  // The actions live in a disclosure, so it has to be open before the captions
  // are painted at all.
  await page.locator(".hymn-more-actions-summary").click();
  const captions = page.locator(
    ".hymn-more-actions-panel .hymn-action-caption",
  );
  await expect(captions.first()).toBeVisible();
  const clipped = await captions.evaluateAll((nodes) =>
    nodes
      .filter((node) => getComputedStyle(node).display !== "none")
      .filter((node) => node.scrollHeight - node.clientHeight > 4)
      .map((node) => node.textContent?.trim() ?? ""),
  );
  expect(clipped).toEqual([]);
});
