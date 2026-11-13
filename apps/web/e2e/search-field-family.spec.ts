import { expect, test } from "@playwright/test";

// The four reading surfaces each grew their own search field: the two catalogs
// and Iman share one control, but Kidung's was 44 px tall with a blue tint and
// a tinted border, so it read as a different widget on the same shelf. This
// contract keeps them one family: same height, border, radius, fill and type.
// `control` is the element that paints the border and the fill; `input` is the
// text box inside it. Kidung paints the input itself, the other three paint a
// wrapper, so the two are measured separately.
const surfaces = [
  {
    path: "/kidung",
    control: ".hymn-search-field input",
    input: ".hymn-search-field input",
  },
  {
    path: "/literatur",
    control: ".search-field",
    input: ".search-field input",
  },
  { path: "/suara", control: ".search-field", input: ".search-field input" },
  {
    path: "/iman",
    control: ".faith-search-bar",
    input: ".faith-search-bar input",
  },
];

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`reading surfaces share one search field at ${viewport.width}`, async ({
    page,
  }) => {
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.setViewportSize(viewport);

    const seen: {
      path: string;
      height: number;
      radius: string;
      border: string;
      fill: string;
      size: string;
    }[] = [];

    for (const surface of surfaces) {
      await page.goto(`/GYSApp-Tauri${surface.path}`, { waitUntil: "load" });
      const control = page.locator(surface.control).first();
      const input = page.locator(surface.input).first();
      await expect(control, surface.path).toBeVisible();
      await expect(input, surface.path).toBeVisible();

      const box = await control.boundingBox();
      expect(box, `${surface.path} field box`).not.toBeNull();
      const style = await control.evaluate((node) => {
        const computed = getComputedStyle(node);
        return {
          radius: computed.borderRadius,
          border: `${computed.borderTopWidth} ${computed.borderTopColor}`,
          fill: computed.backgroundColor,
        };
      });
      const size = await input.evaluate(
        (node) => getComputedStyle(node).fontSize,
      );

      // A field is a target before it is a decoration.
      expect(
        box!.height,
        `${surface.path} field height`,
      ).toBeGreaterThanOrEqual(44);
      seen.push({
        path: surface.path,
        height: Math.round(box!.height),
        ...style,
        size,
      });
    }

    const [first, ...rest] = seen;
    for (const entry of rest) {
      expect(entry.height, `${entry.path} field height`).toBe(first.height);
      expect(entry.radius, `${entry.path} field radius`).toBe(first.radius);
      expect(entry.border, `${entry.path} field border`).toBe(first.border);
      expect(entry.fill, `${entry.path} field fill`).toBe(first.fill);
      expect(entry.size, `${entry.path} field type size`).toBe(first.size);
    }
  });
}
