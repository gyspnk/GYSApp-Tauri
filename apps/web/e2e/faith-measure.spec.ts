import { expect, test } from "@playwright/test";

// The cap only bites on a wide window; 1920 px is the widest desktop pass.
test.use({ viewport: { width: 1920, height: 1080 } });

test("the doctrine text keeps a readable measure on a wide window", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/iman");
  const statement = page.locator(".faith-statement").first();
  await expect(statement).toBeVisible();
  // Count characters the way the reader sees them: probe 10ch in the same font.
  const ratio = await statement.evaluate((node) => {
    const probe = document.createElement("span");
    probe.style.cssText =
      "position:absolute;visibility:hidden;white-space:pre;font:inherit";
    probe.textContent = "1234567890";
    node.appendChild(probe);
    const ch = probe.getBoundingClientRect().width / 10;
    probe.remove();
    return ch > 0 ? node.getBoundingClientRect().width / ch : 0;
  });
  expect(ratio).toBeGreaterThan(20);
  expect(ratio).toBeLessThanOrEqual(68);
});
