// Capture route screenshots for human review without running the test suite.
//
// The device that writes code must not carry the browser workload (owner
// decision, 2 Nov), so GitHub Actions runs this script against a preview build
// and uploads the PNGs as an artifact. Keep every page deterministic: freeze
// animations, hide the caret, wait for the route marker, and record the
// measured layout numbers next to each image.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.PREVIEW_URL ?? "http://127.0.0.1:4173/GYSApp-Tauri";
const outDir = process.env.SHOT_DIR ?? "ui-screenshots";
const widths = (process.env.SHOT_WIDTHS ?? "390,768,1440")
  .split(",")
  .map((value) => Number(value.trim()));
const themes = (process.env.SHOT_THEMES ?? "light,dark")
  .split(",")
  .map((value) => value.trim());
const locale = process.env.SHOT_LOCALE ?? "id";
const settleMs = Number(process.env.SHOT_SETTLE_MS ?? "900");

const routes = [
  { slug: "beranda", path: "/", marker: ".home-page" },
  { slug: "sauh", path: "/sauh", marker: ".sauh-page, .online-content-page" },
  // The reader opens on Kejadian 1; there is no chapter deep link.
  { slug: "alkitab", path: "/bible", marker: ".verse-text" },
  { slug: "kidung", path: "/kidung", marker: ".hymn-page" },
  {
    slug: "kidung-reader",
    path: "/kidung/hymn-001",
    marker: ".hymn-detail-page",
  },
  { slug: "iman", path: "/iman", marker: ".faith-statement" },
  { slug: "literatur", path: "/literatur", marker: ".literature-page" },
  { slug: "suara", path: "/suara", marker: ".suara-library-grid" },
  { slug: "lainnya", path: "/lainnya", marker: ".more-page" },
  {
    slug: "pengaturan-data",
    path: "/lainnya?section=data",
    marker: ".more-page",
  },
  {
    slug: "tampilan",
    path: "/lainnya?section=appearance",
    marker: ".more-page",
  },
];

await mkdir(outDir, { recursive: true });

// Captures are independent, and the hosted runner has four cores, so a pool
// keeps the job near its CPU budget instead of waiting on one navigation at a
// time. SHOT_CONCURRENCY=1 restores the old serial behaviour.
const concurrency = Math.max(
  1,
  Math.min(Number(process.env.SHOT_CONCURRENCY ?? "3"), 6),
);

const tasks = [];
for (const theme of themes) {
  for (const width of widths) {
    const height = width < 600 ? 844 : width < 1000 ? 1024 : 900;
    for (const route of routes) tasks.push({ theme, width, height, route });
  }
}

const manifest = new Array(tasks.length);
let failures = 0;
let next = 0;

async function capture(browser) {
  while (next < tasks.length) {
    const index = next++;
    const { theme, width, height, route } = tasks[index];
    const file = `${route.slug}-${width}-${theme}.png`;
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      hasTouch: width < 1000,
      reducedMotion: "reduce",
      colorScheme: theme === "dark" || theme === "amoled" ? "dark" : "light",
    });
    await context.addInitScript(
      ([storedTheme, storedLocale]) => {
        try {
          localStorage.setItem(
            "gys-shell-settings-v1",
            JSON.stringify({
              version: 1,
              locale: storedLocale,
              theme: storedTheme,
            }),
          );
        } catch {
          // A blocked store is fine: the shell falls back to its defaults.
        }
      },
      [theme, locale],
    );
    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl}${route.path}`, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      if (route.marker) {
        await page
          .locator(route.marker.split(",")[0].trim())
          .first()
          .waitFor({ state: "visible", timeout: 20_000 });
      }
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(settleMs);
      const metrics = await page.evaluate(() => {
        const root = document.documentElement;
        const frame = document.querySelector(".app-frame");
        return {
          theme: root.dataset.theme ?? null,
          scrollWidth: root.scrollWidth,
          clientWidth: root.clientWidth,
          scrollHeight: root.scrollHeight,
          frameWidth: frame
            ? Math.round(frame.getBoundingClientRect().width)
            : null,
        };
      });
      await page.screenshot({
        path: path.join(outDir, file),
        animations: "disabled",
        caret: "hide",
      });
      const overflow = metrics.scrollWidth - metrics.clientWidth;
      if (overflow > 0) failures += 1;
      manifest[index] = {
        file,
        route: route.path,
        width,
        height,
        theme,
        overflow,
        ...metrics,
      };
    } catch (error) {
      failures += 1;
      manifest[index] = {
        file,
        route: route.path,
        width,
        height,
        theme,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await page.close();
      await context.close();
    }
  }
}

const browsers = await Promise.all(
  Array.from({ length: concurrency }, () => chromium.launch()),
);
await Promise.all(browsers.map((browser) => capture(browser)));
await Promise.all(browsers.map((browser) => browser.close()));

await writeFile(
  path.join(outDir, "manifest.json"),
  `${JSON.stringify({ baseUrl, themes, widths, shots: manifest }, null, 2)}\n`,
);
const shots = manifest.filter((entry) => !entry.error).length;
console.log(
  `${shots}/${manifest.length} screenshots, ${failures} problems → ${outDir}`,
);
process.exit(failures > 0 ? 1 : 0);
