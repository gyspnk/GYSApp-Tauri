import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// A landscape phone has width but no height: one wide column left half the
// window empty and stretched every panel past a readable line length. A very
// short landscape window goes the other way — one row per setting — because two
// columns beside an open panel cannot show both at once.
for (const viewport of [
  { width: 844, height: 390 },
  { width: 1024, height: 600 },
]) {
  test(`settings use both columns in landscape at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/lainnya?section=account");

    const list = page.locator(".more-settings-list");
    await expect(list).toBeVisible();
    const count = await list.evaluate(
      (node) => getComputedStyle(node).gridTemplateColumns.split(" ").length,
    );
    // Under 540 px of height each setting owns a full row; taller landscape
    // windows keep the two readable columns.
    expect(count, "the settings list fills the width it has").toBe(
      viewport.height <= 540 ? 1 : 2,
    );

    // An open panel carries a form or a paragraph, so it takes the whole width
    // instead of wrapping inside half of it.
    const account = page.locator('[data-setting="account"]');
    const listBox = (await list.boundingBox())!;
    const accountBox = (await account.boundingBox())!;
    expect(accountBox.width).toBeGreaterThanOrEqual(listBox.width - 1);

    // Tightening for a short window must never shrink a target below 44 px.
    for (const row of await page.locator(".more-setting-row").all()) {
      expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test(`expanded panels stay compact in landscape at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/lainnya?section=account");

    for (const setting of ["offline", "backup"]) {
      const panel = await measurePanel(page, setting);

      expect(
        panel.widestLineCh,
        `${setting}: no text line stretches past 72 characters`,
      ).toBeLessThanOrEqual(72);
      expect(
        panel.shortControls,
        `${setting}: every control keeps 44 px`,
      ).toEqual([]);
      expect(
        panel.contentOverflow,
        `${setting}: the panel body stays inside its card`,
      ).toBeLessThanOrEqual(1);
      expect(panel.overflowingCards, `${setting}: no card overflows`).toEqual(
        [],
      );

      if (setting === "offline") {
        // Download rows pair up in landscape; a lone name must not own a whole
        // 600 px line with its button parked at the far edge.
        expect(panel.assetRowWidths.length).toBeGreaterThan(0);
        for (const width of panel.assetRowWidths) {
          expect(
            width,
            "two asset rows share a line in landscape",
          ).toBeLessThanOrEqual(panel.contentWidth / 2 + 8);
        }
      } else {
        // The backup panel has one field: it sits beside its actions instead of
        // stacking a full-width input above them.
        const field = panel.field;
        const actions = panel.actions;
        expect(field, "backup form has its password field").not.toBeNull();
        expect(actions, "backup form has its actions").not.toBeNull();
        const overlap =
          Math.min(field!.y + field!.height, actions!.y + actions!.height) -
          Math.max(field!.y, actions!.y);
        expect(overlap, "backup field and actions share a row").toBeGreaterThan(
          0,
        );
        expect(
          field!.width,
          "backup field does not own a full-width row",
        ).toBeLessThan(panel.contentWidth - 40);
      }
    }
  });
}

/**
 * Open one settings panel and measure the layout facts the landscape rules
 * promise: readable text lines, 44 px targets, no overflow, and rows that pair
 * up instead of stretching one short value across the card.
 */
async function measurePanel(page: Page, setting: string) {
  const section = page.locator(`[data-setting="${setting}"]`);
  await section.locator("summary").click();
  await expect(section).toHaveAttribute("open", "");

  return page.evaluate((name) => {
    const root = document.querySelector(`[data-setting="${name}"]`);
    const content = root?.querySelector(".more-settings-content");
    if (!content) throw new Error(`panel ${name} has no body`);

    const rect = (el: Element) => {
      const box = el.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };

    // The widest rendered text line, in "0" characters of the line's own font.
    // Ranges give the real line boxes, so wrapping counts, not element width.
    let widestLineCh = 0;
    const canvas = document.createElement("canvas").getContext("2d")!;
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      const parent = node.parentElement;
      if (!parent) continue;
      const style = getComputedStyle(parent);
      canvas.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const ch = canvas.measureText("0").width || 8;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const line of range.getClientRects()) {
        if (line.width > 0 && line.height > 0) {
          widestLineCh = Math.max(widestLineCh, line.width / ch);
        }
      }
    }

    const cards = [...content.querySelectorAll(".more-card")];
    const field = content.querySelector(".search-field input");
    const actions = content.querySelector(".utility-actions");
    return {
      contentWidth: content.getBoundingClientRect().width,
      contentOverflow: content.scrollWidth - content.clientWidth,
      overflowingCards: cards
        .filter((card) => card.scrollWidth - card.clientWidth > 1)
        .map((card) => card.className),
      widestLineCh,
      shortControls: [...content.querySelectorAll("button, input")]
        .filter((el) => el.getBoundingClientRect().height < 44)
        .map((el) =>
          (el.textContent || el.getAttribute("aria-label") || "")
            .trim()
            .slice(0, 40),
        ),
      assetRowWidths: [
        ...content.querySelectorAll(".distributed-asset-row"),
      ].map((row) => row.getBoundingClientRect().width),
      field: field ? rect(field) : null,
      actions: actions ? rect(actions) : null,
    };
  }, setting);
}
