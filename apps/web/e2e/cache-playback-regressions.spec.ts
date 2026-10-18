import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  preparePinnedMidiAsset,
  preparePinnedReaderAssets,
} from "./pinned-reader-fixtures.js";

const post = JSON.parse(
  readFileSync("public/offline/suara-sejati.json", "utf8"),
).items[0];
const cachedArticle = {
  id: post.id,
  title: post.title,
  url: post.url,
  source: "tjc.org",
  body: "Bacaan lengkap yang tersimpan tetap tersedia tanpa jaringan.",
  fetchedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
};

test("expired article remains fully readable offline", async ({ page }) => {
  const errors: string[] = [];
  let refreshes = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(/^https:\/\//, (route) => {
    if (/content\/article|wp-json\/wp\/v2\/posts/.test(route.request().url()))
      refreshes++;
    return route.abort();
  });
  await page.addInitScript(
    (article) =>
      localStorage.setItem(
        `gys_article_cache_${article.url}`,
        JSON.stringify(article),
      ),
    cachedArticle,
  );
  await page.goto(`/GYSApp-Tauri/suara/${post.id}`);
  await expect(page.locator(".online-article-body")).toContainText(
    cachedArticle.body,
  );
  await expect.poll(() => refreshes).toBeGreaterThan(0);
  await expect(page.locator(".online-article-body")).toContainText(
    cachedArticle.body,
  );
  const stored = await page.evaluate(
    (url) => JSON.parse(localStorage.getItem(`gys_article_cache_${url}`)!),
    post.url,
  );
  expect(stored.body).toBe(cachedArticle.body);
  expect(errors).toEqual([]);
});

test("expired article refreshes without replacing its readable body with a loading screen", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let requested = false;
  await page.route("**/wp-json/wp/v2/posts?**", async (route) => {
    requested = true;
    await pending;
    await route.fulfill({
      json: [
        {
          id: 9001,
          title: { rendered: post.title },
          content: { rendered: "<p>Bacaan lengkap sudah diperbarui.</p>" },
        },
      ],
    });
  });
  await page.addInitScript(
    (article) =>
      localStorage.setItem(
        `gys_article_cache_${article.url}`,
        JSON.stringify(article),
      ),
    cachedArticle,
  );
  try {
    await page.goto(`/GYSApp-Tauri/suara/${post.id}`);
    await expect.poll(() => requested).toBe(true);
    await expect(page.locator(".online-article-body")).toContainText(
      cachedArticle.body,
    );
  } finally {
    finish();
  }
  await expect(page.locator(".online-article-body")).toContainText(
    "Bacaan lengkap sudah diperbarui.",
  );
  expect(
    await page.evaluate(
      (url) => sessionStorage.getItem(`gys_article_cache_${url}`),
      post.url,
    ),
  ).toBeNull();
});

test("another tab updates and removes the visible MIDI queue", async ({
  page,
  context,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/kidung?section=playlist");
  await expect(page.locator(".kidung-queue-surface")).toBeVisible();
  const other = await context.newPage();
  try {
    await other.route(/^https:\/\//, (route) => route.abort());
    await other.goto("/GYSApp-Tauri/");
    await other.evaluate(() =>
      localStorage.setItem(
        "gys-midi-playlist-v1",
        JSON.stringify({
          version: 1,
          items: [{ songId: "hymn-001", title: "Antrean dari tab lain" }],
          currentIndex: 0,
        }),
      ),
    );
    await expect(page.locator(".kidung-queue-surface")).toContainText(
      "Antrean dari tab lain",
    );
    await other.evaluate(() => localStorage.removeItem("gys-midi-playlist-v1"));
    await expect(page.locator(".kidung-queue-surface")).not.toContainText(
      "Antrean dari tab lain",
    );
  } finally {
    await other.close();
  }
});

test("Bible header ignores MIDI position ticks while transport state still updates it", async ({
  page,
}) => {
  await page.addInitScript(() => {
    type Fiber = {
      type: unknown;
      flags: number;
      child?: Fiber;
      sibling?: Fiber;
    };
    const scope = window as unknown as {
      __gysHeaderRenders: number;
      __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown;
    };
    scope.__gysHeaderRenders = 0;
    let previousHeader: Fiber | undefined;
    scope.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      inject: () => 1,
      onCommitFiberRoot: (_id: number, root: { current: Fiber }) => {
        const visit = (fiber?: Fiber) => {
          if (!fiber) return;
          if (
            typeof fiber.type === "function" &&
            String(fiber.type).includes("reader-context-book-picker")
          ) {
            if (fiber !== previousHeader && fiber.flags & 1)
              scope.__gysHeaderRenders++;
            previousHeader = fiber;
          }
          visit(fiber.child);
          visit(fiber.sibling);
        };
        visit(root.current);
      },
      onCommitFiberUnmount: () => undefined,
    };
  });
  await page.route(/^https:\/\//, (route) => route.abort());
  await preparePinnedReaderAssets(page);
  await preparePinnedMidiAsset(page);
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  await page.locator(".hymn-midi-toggle").click();
  const player = page.locator(".media-surface.is-kidung-media");
  await expect(player).toBeVisible({ timeout: 30_000 });
  await page.locator(".media-primary-control").click();
  await expect(player).toHaveAttribute("data-playing", "true", {
    timeout: 30_000,
  });
  await page.locator(".hymn-text-title .viewer-chrome-button").click();
  await expect(page.locator(".hymn-page")).toBeVisible();
  await page
    .getByRole("link", { name: "Alkitab", exact: true })
    .first()
    .click();
  await expect(page.locator(".bible-reader")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1_200);
  const renders = () =>
    page.evaluate(
      () =>
        (window as unknown as { __gysHeaderRenders: number })
          .__gysHeaderRenders,
    );
  const before = await renders();
  expect(before).toBeGreaterThan(0);
  await page.waitForTimeout(1_500);
  await expect(player).toHaveAttribute("data-playing", "true");
  expect(await renders()).toBe(before);
  await page.locator(".media-primary-control").click();
  await expect(player).toHaveAttribute("data-playing", "false");
  await expect.poll(renders).toBeGreaterThan(before);
});
