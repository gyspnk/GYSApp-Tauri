import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

// Regression guard for the narrowest supported phone layout.
test("320px Kidung local navigation keeps every label fully readable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/GYSApp-Tauri/kidung");
  await page.locator(".kidung-local-nav").waitFor({ state: "visible" });

  const links = page.locator(".kidung-local-nav a");
  await expect(links).toHaveCount(3);

  for (let index = 0; index < (await links.count()); index += 1) {
    const metrics = await links.nth(index).evaluate((link) => {
      const label = link.querySelector("span");
      if (!(label instanceof HTMLElement)) return null;
      const linkRect = link.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      return {
        linkLeft: linkRect.left,
        linkRight: linkRect.right,
        labelLeft: labelRect.left,
        labelRight: labelRect.right,
        labelScrollWidth: label.scrollWidth,
        labelClientWidth: label.clientWidth,
      };
    });

    expect(metrics).not.toBeNull();
    expect(metrics!.labelLeft).toBeGreaterThanOrEqual(metrics!.linkLeft - 1);
    expect(metrics!.labelRight).toBeLessThanOrEqual(metrics!.linkRight + 1);
    expect(metrics!.labelScrollWidth).toBeLessThanOrEqual(
      metrics!.labelClientWidth + 1,
    );
  }
});
