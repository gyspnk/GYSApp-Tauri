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

// A route keeps one voice: the article heading must not switch family, size or
// weight on the way in from the catalogue. Suara's article used the reading
// serif at 740 weight and Literatur's at 600, so the same destination changed
// voice between the list and the article it opened.
const detailPairs = [
  {
    list: "/suara",
    detail: "/suara/147-menapaki-tiga-iman",
    heading: ".suara-article-card h1",
  },
  {
    list: "/literatur",
    detail:
      "/literatur/pelita-kecil-https-3A-2F-2Ftjc.org-2Fid-2Fpelitakecil-2Fpk46-2F",
    heading: ".literature-detail-copy h1",
  },
];

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`detail headings keep the catalogue voice at ${viewport.width}`, async ({
    page,
  }) => {
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.setViewportSize(viewport);

    const read = (locator: ReturnType<typeof page.locator>) =>
      locator.evaluate((node) => {
        const computed = getComputedStyle(node);
        return {
          family: computed.fontFamily,
          size: computed.fontSize,
          weight: computed.fontWeight,
          tracking: computed.letterSpacing,
        };
      });

    for (const pair of detailPairs) {
      await page.goto(`/GYSApp-Tauri${pair.list}`, { waitUntil: "load" });
      const listHeading = page.locator(".page-intro h1").first();
      await expect(listHeading).toBeVisible();
      const list = await read(listHeading);

      await page.goto(`/GYSApp-Tauri${pair.detail}`, { waitUntil: "load" });
      const detailHeading = page.locator(pair.heading).first();
      await expect(detailHeading).toBeVisible();
      const detail = await read(detailHeading);

      expect(detail.family, `${pair.detail} family`).toBe(list.family);
      expect(detail.size, `${pair.detail} size`).toBe(list.size);
      expect(detail.weight, `${pair.detail} weight`).toBe(list.weight);
      expect(detail.tracking, `${pair.detail} tracking`).toBe(list.tracking);
    }
  });
}

// The hymn catalogue was the last destination whose name existed only for
// screen readers: every sibling opened on a painted title, so /kidung looked
// like a page without a name (and the toolbar started 3 px under nothing).
test("the hymn catalogue opens on the same title as its siblings", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  const read = async (path: string) => {
    await page.goto(`/GYSApp-Tauri${path}`, { waitUntil: "load" });
    const heading = page.locator(".page-intro h1").first();
    await expect(heading).toBeVisible();
    const box = await heading.boundingBox();
    const style = await heading.evaluate((node) => {
      const computed = getComputedStyle(node);
      return {
        size: computed.fontSize,
        weight: computed.fontWeight,
        left: Math.round(node.getBoundingClientRect().left),
        top: Math.round(node.getBoundingClientRect().top),
      };
    });
    const gap = await page.evaluate(() => {
      const intro = document
        .querySelector(".page-intro")
        ?.getBoundingClientRect();
      const toolbar = document.querySelector(".kidung-index-toolbar");
      if (!intro || !toolbar) return null;
      return Math.round(toolbar.getBoundingClientRect().top - intro.bottom);
    });
    return { text: await heading.textContent(), box, gap, ...style };
  };

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    const hymn = await read("/kidung");
    const literature = await read("/literatur");
    expect(hymn.text).toBe("Kidung");
    expect(hymn.size, "catalogue title size").toBe(literature.size);
    expect(hymn.weight, "catalogue title weight").toBe(literature.weight);
    expect(hymn.top, "catalogue title row").toBe(literature.top);
    expect(hymn.left, "catalogue title edge").toBe(literature.left);

    // The catalogue's own toolbar must not sit flush under the heading.
    expect(hymn.gap, "toolbar gap under the title").not.toBeNull();
    expect(hymn.gap!, "toolbar gap under the title").toBeGreaterThanOrEqual(16);
  }
});
