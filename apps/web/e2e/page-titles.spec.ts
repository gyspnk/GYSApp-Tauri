import { expect, test } from "@playwright/test";

// The three catalogue destinations share one header treatment. Iman used to
// render its heading screen-reader-only, so the route opened with no visible
// name while Literatur and Suara showed one at the same spot.
const pages = [
  { path: "/literatur", title: "Literatur" },
  { path: "/suara", title: "Suara Sejati" },
  { path: "/iman", title: "Dasar Kepercayaan" },
];

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`catalogue destinations paint one title at ${viewport.width}`, async ({
    page,
  }) => {
    await page.route(/^https:\/\//, (route) => route.abort());

    const seen: {
      title: string;
      size: string;
      weight: string;
      top: number;
      left: number;
    }[] = [];
    for (const entry of pages) {
      await page.goto(`/GYSApp-Tauri${entry.path}`, { waitUntil: "load" });
      await page.setViewportSize(viewport);
      const heading = page
        .locator(".page-intro h1", { hasText: entry.title })
        .first();
      await expect(heading).toBeVisible();
      await expect(heading).toHaveText(entry.title);

      const box = await heading.boundingBox();
      const style = await heading.evaluate((node) => {
        const computed = getComputedStyle(node);
        return { size: computed.fontSize, weight: computed.fontWeight };
      });
      expect(box, entry.path).not.toBeNull();
      expect(box!.height, `${entry.path} heading height`).toBeGreaterThan(
        viewport.width < 720 ? 28 : 32,
      );
      seen.push({
        title: entry.title,
        ...style,
        top: Math.round(box!.y),
        left: Math.round(box!.x),
      });
    }

    const [first, ...rest] = seen;
    for (const entry of rest) {
      expect(
        entry.size,
        `${entry.title} font size matches ${first.title}`,
      ).toBe(first.size);
      expect(
        entry.weight,
        `${entry.title} font weight matches ${first.title}`,
      ).toBe(first.weight);
      expect(
        Math.abs(entry.top - first.top),
        `${entry.title} shares the title row`,
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(entry.left - first.left),
        `${entry.title} shares the left edge`,
      ).toBeLessThanOrEqual(1);
    }
  });
}
