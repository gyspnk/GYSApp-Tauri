import { expect, test } from "@playwright/test";

// Eyebrows above a heading are the smallest text in the shell. They used to be
// 0.625rem, which rendered 10 px at 1440 — below the 12 px floor the rest of the
// app keeps for micro text, and below the size at which the uppercase tracking
// still reads as a label rather than a smudge.
// The Bible's translation label sits inside a screen-reader-only heading, so it
// is not painted and has no size to hold to a floor.
const ROUTES = ["/", "/literatur"];

for (const width of [390, 1440]) {
  test(`eyebrows keep the micro-text floor at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
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

    for (const route of ROUTES) {
      await page.goto(`/GYSApp-Tauri${route}`);
      const lines = page.locator(".date-line");
      await expect(lines.first()).toBeVisible();
      const sizes = await lines.evaluateAll((nodes) =>
        nodes.map((node) => parseFloat(getComputedStyle(node).fontSize)),
      );
      expect(sizes.length).toBeGreaterThan(0);
      for (const size of sizes) expect(size).toBeGreaterThanOrEqual(12);
    }
  });
}

// The settings page carried its own micro text below the shell floor: group
// labels, pack badges, the origin line, form hints and the field labels all
// rendered at 10-11 px on a desktop. One floor for every painted leaf.
for (const width of [390, 1440]) {
  test(`settings keep the micro-text floor at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
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
    await page.goto("/GYSApp-Tauri/lainnya");
    await expect(page.locator(".more-page h1")).toBeVisible();

    const small = await page.evaluate(() => {
      const found: { text: string; size: number }[] = [];
      for (const node of document.querySelectorAll(".more-page *")) {
        const text = (node.textContent ?? "").trim();
        if (!text || node.children.length > 0) continue;
        const box = node.getBoundingClientRect();
        if (box.width < 2 || box.height < 2) continue;
        const size = parseFloat(getComputedStyle(node).fontSize);
        if (size < 12) found.push({ text: text.slice(0, 24), size });
      }
      return found;
    });

    expect(small).toEqual([]);
  });
}
