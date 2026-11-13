import { expect, test } from "@playwright/test";

// The three catalogue destinations share one header treatment. Iman used to
// render its heading screen-reader-only, so the route opened with no visible
// name while Literatur and Suara showed one at the same spot.
const pages = [
  { path: "/literatur", title: "Literatur", field: ".search-field" },
  { path: "/suara", title: "Suara Sejati", field: ".search-field" },
  { path: "/iman", title: "Dasar Kepercayaan", field: ".faith-search-bar" },
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
      fieldTop: number;
      introBottom: number;
      fieldHeight: number;
      fieldRadius: string;
      fieldBorder: string;
      fieldInput: string;
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

      // The search field under the title is the same control on all three
      // routes: same height, border, radius and input size, and the same gap
      // from the title. Iman used to be 54 px tall with its own shadow and sat
      // flush against the heading.
      const intro = page.locator(".page-intro").first();
      const introBox = await intro.boundingBox();
      expect(introBox, `${entry.path} intro`).not.toBeNull();

      const field = page.locator(entry.field).first();
      await expect(field).toBeVisible();
      const fieldBox = await field.boundingBox();
      const fieldStyle = await field.evaluate((node) => {
        const computed = getComputedStyle(node);
        const input = node.querySelector("input");
        return {
          radius: computed.borderRadius,
          border: `${computed.borderTopWidth} ${computed.borderTopColor}`,
          input: input ? getComputedStyle(input).fontSize : "",
        };
      });
      expect(fieldBox, `${entry.path} search field`).not.toBeNull();

      seen.push({
        title: entry.title,
        ...style,
        top: Math.round(box!.y),
        left: Math.round(box!.x),
        fieldTop: Math.round(fieldBox!.y),
        introBottom: Math.round(introBox!.y + introBox!.height),
        fieldHeight: Math.round(fieldBox!.height),
        fieldRadius: fieldStyle.radius,
        fieldBorder: fieldStyle.border,
        fieldInput: fieldStyle.input,
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
      expect(
        entry.fieldHeight,
        `${entry.title} search field height matches ${first.title}`,
      ).toBe(first.fieldHeight);
      expect(entry.fieldRadius, `${entry.title} field radius`).toBe(
        first.fieldRadius,
      );
      expect(entry.fieldBorder, `${entry.title} field border`).toBe(
        first.fieldBorder,
      );
      expect(entry.fieldInput, `${entry.title} field input size`).toBe(
        first.fieldInput,
      );
      // The gap under the title is the page rhythm (18 px), not a per-route
      // number: on a wide screen the toolbar aligns the field's bottom with a
      // taller sort control, so the field sits a few pixels lower there. What
      // must not happen is a field flush against the heading, which is what
      // Iman did before this contract existed.
      const gap = entry.fieldTop - entry.introBottom;
      expect(
        gap,
        `${entry.title} leaves room under its title`,
      ).toBeGreaterThanOrEqual(18);
      expect(
        gap,
        `${entry.title} does not drift from its title`,
      ).toBeLessThanOrEqual(40);
    }
  });
}
