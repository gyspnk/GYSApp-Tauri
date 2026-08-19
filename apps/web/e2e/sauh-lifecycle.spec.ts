import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("Sauh shows a verified saved snapshot before slow live revalidation", async ({
  page,
}) => {
  await page.route("**/offline/sauh.json", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "saved-sauh",
            title: "Renungan tersimpan",
            reference: "Mazmur 1:1",
            verse: "Berbahagialah orang yang berjalan bersama Tuhan.",
            body: "Isi renungan tersimpan yang tetap dapat dibaca.",
            url: "https://tjc.org/id/gerakan-baca-alkitab/saved-sauh/",
            updatedAt: "2026-08-16T00:00:00.000Z",
            source: "tjc.org",
          },
        ],
      },
    }),
  );
  await page.route(
    /tjc\.org\/id\/wp-json\/wp\/v2\/posts\?.*categories=229/,
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      await route.fulfill({
        json: [
          {
            id: 18,
            slug: "live-sauh",
            date: "2026-08-19T00:00:00.000Z",
            link: "https://tjc.org/id/gerakan-baca-alkitab/live-sauh/",
            title: { rendered: "Renungan hari ini" },
            content: {
              rendered:
                "<h4>Yohanes 3:16</h4><p>Karena begitu besar kasih Allah akan dunia ini.</p>",
            },
          },
        ],
      });
    },
  );

  await page.goto("/GYSApp-Tauri/");
  await expect(
    page.getByText("Renungan tersimpan", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Konten tersimpan Sauh Bagi Jiwa/)).toBeVisible();
  await expect(
    page.getByText("Renungan hari ini", { exact: true }),
  ).toBeVisible({
    timeout: 5_000,
  });
});
