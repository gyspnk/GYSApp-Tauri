import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("Sauh keeps an aesthetic loading state instead of showing stale content", async ({
  page,
}) => {
  // The packaged snapshot only contains an older reflection from another
  // day; it must never be painted as today's entry.
  await page.route("**/offline/sauh.json", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "sbj260816",
            title: "Orang Biasa yang Luar Biasa",
            reference: "Hakim-Hakim 3:31",
            verse: "Sesudah dia, bangkitlah Samgar bin Anat.",
            body: "Konten lama yang dapat menyebabkan salah paham bila tampil.",
            url: "https://tjc.org/id/gerakan-baca-alkitab/sbj260816/",
            updatedAt: "2026-08-16T00:09:34+00:00",
            source: "tjc.org",
          },
        ],
      },
    }),
  );
  let releaseLive: (() => void) | undefined;
  const liveGate = new Promise<void>((resolve) => {
    releaseLive = resolve;
  });
  await page.route(
    /tjc\.org\/id\/wp-json\/wp\/v2\/posts\?.*categories=229/,
    async (route) => {
      // Hold revalidation open so the loading contract can be asserted
      // deterministically regardless of machine speed.
      await liveGate;
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.fulfill({
        json: [
          {
            id: 18,
            slug: "live-sauh",
            date: new Date().toISOString(),
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
  const skeleton = page.getByTestId("home-sauh-skeleton");
  await expect(skeleton).toBeVisible();
  await expect(skeleton.getByText(/Memuat Sauh Bagi Jiwa/)).toBeVisible();
  // The stale reflection is never rendered while loading.
  await expect(
    page.getByText("Orang Biasa yang Luar Biasa", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(/Konten tersimpan/)).toHaveCount(0);

  // Once revalidation finishes the verified today entry replaces the loading
  // state incrementally.
  releaseLive?.();
  await expect(
    page.getByText("Renungan hari ini", { exact: true }),
  ).toBeVisible({
    timeout: 5_000,
  });
});

test("Sauh surfaces an explicit error state when today's entry cannot be fetched", async ({
  page,
}) => {
  await page.route("**/offline/sauh.json", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "sbj200101",
            title: "Snapshot tua",
            body: "Isi snapshot lama.",
            url: "https://tjc.org/id/gerakan-baca-alkitab/sbj200101/",
            updatedAt: "2020-01-01T00:00:00.000Z",
            source: "tjc.org",
          },
        ],
      },
    }),
  );
  await page.route("**/wp-json/wp/v2/posts**", (route) =>
    route.abort("connectionrefused"),
  );
  await page.goto("/GYSApp-Tauri/sauh");
  await expect(page.getByRole("status").first()).toBeVisible();
  await expect(page.getByText(/belum tersedia/i).first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("Snapshot tua")).toHaveCount(0);
});
