import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const logo = readFileSync(
  new URL("../public/assets/gys-logo.png", import.meta.url),
);

function todaySauh() {
  const date = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );
  const slug = `sbj${date.year.slice(-2)}${date.month}${date.day}`;
  const image = "https://tjcorguploads.s3.amazonaws.com/fixture/sauh.png";
  return {
    id: slug,
    title: "Renungan hari ini",
    reference: "Yohanes 3:16",
    verse: "Karena begitu besar kasih Allah akan dunia ini.",
    body: "Fixture cadangan tinggi kartu ayat.",
    url: `https://tjc.org/id/gerakan-baca-alkitab/${slug}/`,
    updatedAt: new Date().toISOString(),
    source: "tjc.org",
    imageUrl: image,
    imageSrcSet: image,
  };
}

async function routeHome(page: Page) {
  const item = todaySauh();
  await page.addInitScript(() => {
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({ version: 1, locale: "id", theme: "light" }),
    );
    localStorage.setItem("gys-locale", "id");
    localStorage.setItem("gys-theme", "light");
  });
  // Slow feed: keeps the skeleton on screen long enough to measure it.
  await page.route("**/offline/sauh.json", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.fulfill({ json: { items: [item] } });
  });
  await page.route("**/offline/suara-sejati.json", (route) =>
    route.fulfill({ json: { source: "tjc.org", items: [] } }),
  );
  await page.route("**/offline/literature.json", (route) =>
    route.fulfill({ json: { source: "tjc.org", items: [] } }),
  );
  await page.route("https://tjc.org/**", (route) => route.abort());
  await page.route("https://tjcorguploads.s3.amazonaws.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: logo }),
  );
}

async function panelHeight(page: Page) {
  return page
    .locator(".verse-panel")
    .evaluate((el) => el.getBoundingClientRect().height);
}

// The verse card is the last quiet placeholder before the feed lands. On phones
// and tablets it used to be 180/182 px while the loaded card was 489-699 px, so
// every section below it dropped on arrival (CLS 0.22 at 320 px, 0.32 at 768 px).
for (const width of [390, 900]) {
  test(`verse slot keeps its height when the verse arrives at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await routeHome(page);
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto("/GYSApp-Tauri/");
    await expect(page.locator(".sauh-skeleton")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    const skeleton = await panelHeight(page);

    await expect(page.locator(".sauh-card-body")).toBeVisible();
    await expect(page.locator(".sauh-image-wrap")).toHaveAttribute(
      "data-image-state",
      "loaded",
    );
    await page.waitForTimeout(300);
    const loaded = await panelHeight(page);

    expect(Math.abs(loaded - skeleton)).toBeLessThanOrEqual(40);
  });
}
