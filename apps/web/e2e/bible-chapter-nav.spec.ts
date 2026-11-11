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

test("the text keeps a readable measure in portrait and spans a landscape page", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());

  const measure = async (viewport: { width: number; height: number }) => {
    await page.setViewportSize(viewport);
    await page.goto("/GYSApp-Tauri/bible");
    await expect(page.locator(".verse-content").first()).toBeVisible();
    return page.evaluate(() => {
      const content = document.querySelector(".verse-content") as HTMLElement;
      const number = document.querySelector(".verse-number") as HTMLElement;
      const style = getComputedStyle(content);
      const probe = document.createElement("span");
      probe.style.cssText = "position:absolute;visibility:hidden;width:10ch";
      probe.style.fontFamily = style.fontFamily;
      probe.style.fontSize = style.fontSize;
      probe.style.fontWeight = style.fontWeight;
      document.body.append(probe);
      const ch = probe.getBoundingClientRect().width / 10;
      probe.remove();
      return {
        width: content.clientWidth,
        ch,
        numeric: getComputedStyle(number).fontVariantNumeric,
        page: document.querySelector("main")?.clientWidth ?? 0,
      };
    });
  };

  // Portrait keeps the 90-character ceiling: a full-width column would be
  // unreadable on a tall phone.
  const portrait = await measure({ width: 768, height: 1024 });
  expect(portrait.numeric).toBe("tabular-nums");
  expect(portrait.width / portrait.ch).toBeLessThanOrEqual(90);

  // Landscape is the owner's full-width reading mode, so the column must own
  // the page instead of the old centred 46rem card.
  const landscape = await measure({ width: 1440, height: 900 });
  expect(landscape.numeric).toBe("tabular-nums");
  expect(landscape.width / landscape.page).toBeGreaterThanOrEqual(0.85);
});
