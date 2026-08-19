import { expect, test } from "@playwright/test";

test("home paints saved Suara content before slow live revalidation", async ({
  page,
}) => {
  await page.route("**/api/v1/content/suara-sejati", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        source: "tjc.org",
        generatedAt: "2026-08-19T00:00:00.000Z",
        items: [
          {
            id: "kesaksian-terbaru",
            title: "Kesaksian terbaru",
            excerpt: "Konten live yang sudah direvalidasi.",
            url: "https://tjc.org/id/suarasejati/kesaksian-terbaru/",
            publishedAt: "2026-08-19T00:00:00.000Z",
            source: "tjc.org",
          },
        ],
      }),
    });
  });

  await page.goto("/GYSApp-Tauri/");
  await expect(page.getByText("Menapaki Tiga Iman Bag 2")).toBeVisible({
    timeout: 800,
  });
  await expect(page.getByText("Kesaksian terbaru")).toBeVisible({
    timeout: 3_000,
  });
});
