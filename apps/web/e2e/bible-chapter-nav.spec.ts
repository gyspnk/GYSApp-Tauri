import { expect, test } from "@playwright/test";

test("the reader walks chapters from the foot of the text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.locator(".verse-text").first()).toBeVisible();

  const title = page.locator(".picker-book-title");
  const before = (await title.innerText()).trim();
  const nav = page.locator(".bible-chapter-nav");
  await nav.scrollIntoViewIfNeeded();
  await expect(nav).toBeVisible();

  const steps = nav.getByRole("button");
  await expect(steps).toHaveCount(2);
  for (const step of await steps.all()) {
    const box = await step.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  await steps.nth(1).click();
  await expect(title).not.toHaveText(before);

  await steps.first().click();
  await expect(title).toHaveText(before);
});

test("phones keep both chapter doors stacked and reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.locator(".verse-text").first()).toBeVisible();

  const nav = page.locator(".bible-chapter-nav");
  await nav.scrollIntoViewIfNeeded();
  await expect(nav).toBeVisible();
  const boxes = await nav
    .getByRole("button")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().height),
    );
  expect(boxes).toHaveLength(2);
  for (const height of boxes) expect(height).toBeGreaterThanOrEqual(44);
});

test("the text keeps a readable measure and tabular verse numbers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.locator(".verse-content").first()).toBeVisible();

  const metrics = await page.evaluate(() => {
    const content = document.querySelector(".verse-content") as HTMLElement;
    const number = document.querySelector(".verse-number") as HTMLElement;
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;width:10ch";
    probe.style.font = getComputedStyle(content).font;
    document.body.append(probe);
    const ch = probe.getBoundingClientRect().width / 10;
    probe.remove();
    return {
      width: content.clientWidth,
      ch,
      numeric: getComputedStyle(number).fontVariantNumeric,
    };
  });

  expect(metrics.numeric).toBe("tabular-nums");
  expect(metrics.width / metrics.ch).toBeLessThanOrEqual(66);
});
