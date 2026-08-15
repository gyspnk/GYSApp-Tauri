import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("Sauh outage shows an actionable empty state instead of a fabricated daily verse", async ({
  page,
}) => {
  await page.route("**/wp-json/wp/v2/posts**", (route) =>
    route.fulfill({ status: 503, body: "upstream unavailable" }),
  );
  await page.route("**/api/v1/content/sauh", (route) =>
    route.fulfill({ status: 503, body: "upstream unavailable" }),
  );
  await page.route("**/offline/sauh.json", (route) =>
    route.fulfill({ status: 503, body: "snapshot unavailable" }),
  );

  await page.goto("/GYSApp-Tauri/");
  await expect(page.locator(".sauh-offline-state")).toBeVisible();
  await expect(page.getByText("Sauh hari ini belum tersedia")).toBeVisible();
  await expect(page.getByRole("button", { name: "Coba lagi" })).toBeVisible();
  await expect(
    page.locator(".sauh-offline-state").getByText("Firman untuk hari ini"),
  ).toHaveCount(0);
  await expect(page.locator(".verse-panel blockquote")).toHaveCount(0);
});
