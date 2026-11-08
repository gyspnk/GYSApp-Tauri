import { expect, test } from "@playwright/test";

// The reader may paint from per-book files before the full pack arrives. Any
// runtime error there is a real regression, so the first chapter must appear
// with a clean console.
test("Bible reader paints its first chapter without a runtime error", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(String(error.stack ?? error));
  });
  const messages: string[] = [];
  page.on("console", (message) => {
    messages.push(`${message.type()}: ${message.text()}`);
  });
  await page.goto("/GYSApp-Tauri/bible");
  try {
    await expect(page.getByRole("heading", { name: /Kejadian 1/ })).toBeVisible(
      {
        timeout: 20_000,
      },
    );
  } finally {
    if (errors.length || messages.length)
      console.log(
        `[bible-boot]${JSON.stringify({
          errors: errors.slice(-3),
          messages: messages.slice(-12),
          body: await page
            .locator("main")
            .innerText()
            .catch(() => ""),
        })}`,
      );
  }
  await expect(page.locator(".verse-text").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("the first chapter does not wait for the whole shelf", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let shelfAnswered = false;
  await page.route("**/offline/bible/tb-reader.json*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    shelfAnswered = true;
    await route.continue();
  });
  const bookPack = page.waitForRequest(/\/offline\/bible\/books\/1\.json\.gz/);
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.getByRole("heading", { name: /Kejadian 1/ })).toBeVisible({
    timeout: 20_000,
  });
  expect((await bookPack).url()).toContain("/offline/bible/books/1.json.gz");
  expect(shelfAnswered).toBe(false);
});
