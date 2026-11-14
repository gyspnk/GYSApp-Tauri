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

// Every painted leaf in the shell, not only the settings page: the shortcut
// badge, section labels, field labels, the hymn action captions, the scope
// pills, the tempo unit and the capo readout all sat at 10-11 px while the
// floor said 12. The walk skips screen-reader-only text, which is never painted.
const SURFACES = [
  { path: "/", ready: ".home-portals" },
  { path: "/kidung", ready: ".pujian-list > li" },
  { path: "/kidung/hymn-001", ready: ".hymn-text-title h1" },
  { path: "/bible?book=kejadian&chapter=1", ready: ".verse-content" },
  { path: "/literatur", ready: ".page-intro h1" },
  { path: "/iman", ready: ".faith-rows" },
  { path: "/lainnya", ready: ".more-settings-list" },
];

for (const width of [390, 1440]) {
  test(`every painted leaf keeps the micro-text floor at ${width}px`, async ({
    page,
  }) => {
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

    const read = () =>
      page.evaluate(() => {
        const found: { text: string; size: number }[] = [];
        const walk = (node: Element) => {
          for (const child of node.children) {
            const style = getComputedStyle(child);
            if (
              style.display === "none" ||
              style.visibility === "hidden" ||
              child.closest(".sr-only")
            ) {
              continue;
            }
            const ownText = [...child.childNodes].some(
              (item) =>
                item.nodeType === Node.TEXT_NODE &&
                (item.textContent ?? "").trim().length > 1,
            );
            if (ownText) {
              const box = child.getBoundingClientRect();
              const size = parseFloat(style.fontSize);
              if (box.width > 1 && box.height > 1 && size < 12) {
                found.push({
                  text: (child.textContent ?? "").trim().slice(0, 24),
                  size,
                });
              }
            }
            walk(child);
          }
        };
        walk(document.body);
        return found;
      });

    for (const surface of SURFACES) {
      await page.goto(`/GYSApp-Tauri${surface.path}`);
      await expect(page.locator(surface.ready).first()).toBeVisible();
      // Panels paint a loading note before their rows, so a single read can
      // catch a transient state. Poll until the page is clean, and only judge
      // an offender that survives a further second on screen.
      let offenders = await read();
      for (
        let attempt = 0;
        attempt < 20 && offenders.length > 0;
        attempt += 1
      ) {
        await page.waitForTimeout(250);
        offenders = await read();
      }
      if (offenders.length > 0) {
        await page.waitForTimeout(1000);
        offenders = await read();
      }
      expect(offenders, `painted text under 12 px on ${surface.path}`).toEqual(
        [],
      );
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

    // The panel paints a loading note, then the asset rows, then the check
    // results; measuring mid-flight catches a transient state. Wait for two
    // consecutive reads to agree before judging.
    const read = () =>
      page.evaluate(() => {
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
    let previous = await read();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await page.waitForTimeout(250);
      const current = await read();
      if (JSON.stringify(current) === JSON.stringify(previous)) break;
      previous = current;
    }

    expect(previous).toEqual([]);
  });
}
