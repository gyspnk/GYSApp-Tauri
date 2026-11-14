import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const suara = JSON.parse(
  readFileSync("public/offline/suara-sejati.json", "utf8"),
).items[0];

// The article column used to grow with the window: 1613 px at 2560 px wide,
// about 176 characters per line, while the heading above it stayed short. The
// 88ch ceiling is the same one the Bible reader and the Iman rows use.
for (const width of [1440, 2560]) {
  test(`the article keeps a readable measure at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(
      ({ article }) => {
        localStorage.setItem(
          "gys-shell-settings-v1",
          JSON.stringify({
            version: 1,
            locale: "id",
            theme: "light",
            onboarded: true,
          }),
        );
        localStorage.setItem(
          `gys_article_cache_${article.url}`,
          JSON.stringify({ ...article, fetchedAt: new Date().toISOString() }),
        );
      },
      { article: suara },
    );
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto(`/GYSApp-Tauri/suara/${suara.id}`);
    const body = page.locator(".suara-article-card .online-article-body");
    await expect(body).toBeVisible();

    const measured = await body.evaluate((node) => {
      const style = getComputedStyle(node);
      const probe = document.createElement("span");
      probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${style.font}`;
      probe.textContent = "0".repeat(88);
      document.body.append(probe);
      const ceiling = probe.getBoundingClientRect().width;
      probe.remove();
      const paragraph = [...node.querySelectorAll("p")].find(
        (item) => item.textContent.trim().length > 120,
      );
      let perLine = 0;
      if (paragraph) {
        const range = document.createRange();
        range.selectNodeContents(paragraph);
        const lines = [...range.getClientRects()].filter(
          (rect) => rect.width > 40,
        ).length;
        perLine = Math.round(paragraph.textContent.length / lines);
      }
      const card = node.closest(".online-article-card")!;
      // The artwork sits in its own column, so only the copy column counts.
      const edges = [...card.children]
        .filter((child) => !child.classList.contains("img-skeleton-wrapper"))
        .map((child) => Math.round(child.getBoundingClientRect().right));
      return {
        width: node.getBoundingClientRect().width,
        ceiling,
        perLine,
        edges: [...new Set(edges)],
      };
    });

    expect(measured.width).toBeLessThanOrEqual(measured.ceiling + 1);
    expect(measured.perLine).toBeLessThanOrEqual(92);
    // The date, heading, note, body and actions end on one edge.
    expect(measured.edges).toHaveLength(1);
  });
}
