import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * The catalogue arrives as one wave on a card that is already a screen tall.
 * Two regressions are guarded here: a fourteen-row first batch left the card
 * half height and grew it in steps (reported as "the entrance only animates
 * half the page"), and the wave used to start on mount, so a slow load spent it
 * on an empty list. The first paint is recorded from inside the page because
 * the wave lasts only 760 ms — a test that samples later races the class.
 */
type WaveRecord = {
  sampled: boolean;
  rows: number;
  height: number;
  viewport: number;
  onScreen: number;
  maxDelayMs: number;
  animationNames: string[];
  onScreenAnimationNames: string[];
  onScreenOpaque: boolean;
  // A name alone also matches a zero-length or paused animation, so the first
  // frame proves the wave actually runs: `animation: none` reports 0s.
  firstWaveMoving: boolean;
  onScreenMoving: boolean;
};

declare global {
  interface Window {
    __catalogueWave?: WaveRecord;
    __firstRenderedTitles?: string[];
  }
}

const recordWave = () => {
  const record: WaveRecord = {
    sampled: false,
    rows: 0,
    height: 0,
    viewport: window.innerHeight,
    onScreen: 0,
    maxDelayMs: 0,
    animationNames: [],
    onScreenAnimationNames: [],
    onScreenOpaque: false,
    firstWaveMoving: false,
    onScreenMoving: false,
  };
  window.__catalogueWave = record;
  const sample = () => {
    if (record.sampled) return;
    const list = document.querySelector(".pujian-list.is-staggering");
    if (!list) return;
    const rows = [...list.querySelectorAll<HTMLElement>(".pujian-item")];
    if (!rows.length) return;
    record.sampled = true;
    record.rows = rows.length;
    record.height = list.clientHeight;
    const styles = rows.map((row) => getComputedStyle(row));
    const delays = styles.map(
      (style) => (Number.parseFloat(style.animationDelay) || 0) * 1000,
    );
    record.maxDelayMs = Math.round(Math.max(0, ...delays));
    record.animationNames = styles.map((style) => style.animationName);
    const isMoving = (style: CSSStyleDeclaration) =>
      (Number.parseFloat(style.animationDuration) || 0) > 0 &&
      style.animationPlayState === "running";
    record.firstWaveMoving = styles.slice(0, 60).every(isMoving);
    const onScreenStyles = rows.flatMap((row, index) => {
      const style = styles[index];
      if (!style) return [];
      const rect = row.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight ? [style] : [];
    });
    record.onScreen = onScreenStyles.length;
    record.onScreenAnimationNames = onScreenStyles.map(
      (style) => style.animationName,
    );
    record.onScreenOpaque = onScreenStyles.every(
      (style) => style.opacity === "1",
    );
    record.onScreenMoving = onScreenStyles.every(isMoving);
  };
  // `document.documentElement` does not exist yet inside an init script, so
  // watch the document node itself; a subtree observer there still sees every
  // class and child change.
  new MutationObserver(sample).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class"],
  });
};

test.describe("kidung catalogue entrance", () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    for (const reducedMotion of ["no-preference", "reduce"] as const) {
      test(`first wave covers the screen with motion ${reducedMotion} at ${viewport.width}px`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion });
        await page.addInitScript(recordWave);
        await page.goto("/GYSApp-Tauri/");
        await page.getByRole("link", { name: "Kidung" }).first().click();

        await expect
          .poll(
            async () =>
              (await page.evaluate(() => window.__catalogueWave))?.sampled,
            { timeout: 10_000 },
          )
          .toBe(true);
        const wave = await page.evaluate(() => window.__catalogueWave);
        expect(wave).toBeTruthy();
        if (!wave) return;

        // Sampled while the real class is active, not after its 760 ms timer.
        expect(wave.height).toBeGreaterThanOrEqual(wave.viewport * 0.7);
        expect(wave.onScreen).toBeGreaterThanOrEqual(
          viewport.width === 1440 ? 20 : 8,
        );
        expect(wave.maxDelayMs).toBeLessThanOrEqual(250);
        if (reducedMotion === "reduce") {
          expect(wave.animationNames).toEqual(Array(wave.rows).fill("none"));
          expect(wave.onScreenOpaque).toBe(true);
          // Counter-check: the probe above must go false when nothing moves.
          expect(wave.firstWaveMoving).toBe(false);
        } else {
          expect(wave.animationNames).toEqual(
            Array.from({ length: wave.rows }, (_, index) =>
              index < 60 ? "catalogue-row-in" : "none",
            ),
          );
          expect(wave.onScreenAnimationNames).toEqual(
            Array(wave.onScreen).fill("catalogue-row-in"),
          );
          // The first frame is captured during the delay, so opacity is still
          // transient here; only the running animation is asserted.
          expect(wave.firstWaveMoving).toBe(true);
          expect(wave.onScreenMoving).toBe(true);
        }

        // The wave ends on its own and leaves nothing animating.
        await expect(page.locator(".pujian-list.is-staggering")).toHaveCount(0);
        const settled = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>(".pujian-item")].every(
            (row) => getComputedStyle(row).opacity === "1",
          ),
        );
        expect(settled).toBe(true);
      });
    }
  }

  test("the tail of the list stays still", () => {
    // The off-screen tail never scrolls in on its own, so the rule is checked
    // where it lives: a saturated delay and a hard stop after sixty rows.
    const css = readFileSync(
      path.join(import.meta.dirname, "..", "src", "app-design.css"),
      "utf8",
    );
    const rule = css.slice(css.indexOf(".pujian-list.is-staggering"));
    expect(rule).toContain("min(");
    expect(rule).toContain("240ms");
    expect(rule).toContain(".pujian-item:nth-child(n + 61)");
  });

  test("cold load with a saved installed collection waits for delayed metadata and animates the saved book once", async ({
    page,
  }) => {
    const master = readFileSync(
      new URL("./fixtures/two-page.pdf", import.meta.url),
    );
    const metadata = Buffer.from(
      JSON.stringify([
        {
          number: "001",
          title: "Mapped Hymn",
          verses: ["Mapped hymn verse"],
          pdfFile: "pdf/hymne/001.pdf",
          page: 2,
          pages: 1,
        },
        {
          number: "002",
          title: "Unmapped Hymn",
          verses: ["Unmapped hymn verse"],
          pdfFile: "pdf/hymne/002.pdf",
        },
      ]),
    );
    const sha256 = (bytes: Uint8Array) =>
      createHash("sha256").update(bytes).digest("hex");

    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/lainnya");
    await page.evaluate(
      async ({ pdf, index, record }) => {
        const bytes = (base64: string) =>
          Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
        const cache = await caches.open(record.cacheName);
        await cache.put(record.cacheKey, new Response(bytes(pdf)));
        await cache.put(record.metadataCacheKey!, new Response(bytes(index)));
        localStorage.setItem(
          "gys-distributed-assets-v1",
          JSON.stringify({ [record.code]: record }),
        );
        localStorage.setItem("gys-kidung-collection-v1", "english");
      },
      {
        pdf: master.toString("base64"),
        index: metadata.toString("base64"),
        record: {
          code: "HYMNE",
          kind: "hymnal",
          version: "test-1",
          releaseTag: "test",
          installFileName: "hymne.gyspkg",
          packageSizeBytes: master.byteLength,
          packageChecksumSha256: sha256(master),
          cacheName: "gys-distributed-v1-test",
          cacheKey: "https://gysapp.local/distributed-assets/HYMNE/master",
          payloadBytes: master.byteLength,
          payloadChecksumSha256: sha256(master),
          installedAt: "2026-11-13T00:00:00.000Z",
          metadataCacheKey:
            "https://gysapp.local/distributed-assets/HYMNE/index",
          metadataBytes: metadata.byteLength,
          metadataChecksumSha256: sha256(metadata),
        },
      },
    );

    await page.addInitScript(() => {
      const originalMatch = Cache.prototype.match;
      Cache.prototype.match = async function (request, options) {
        const url = typeof request === "string" ? request : request.url;
        if (url === "https://gysapp.local/distributed-assets/HYMNE/index") {
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
        return originalMatch.call(this, request, options);
      };
      new MutationObserver(() => {
        if (window.__firstRenderedTitles) return;
        const labels = [
          ...document.querySelectorAll<HTMLElement>(
            ".pujian-item .pujian-title-label",
          ),
        ]
          .map((node) => node.textContent?.trim() ?? "")
          .filter(Boolean);
        if (labels.length > 0) window.__firstRenderedTitles = labels;
      }).observe(document, { subtree: true, childList: true });
    });
    await page.addInitScript(recordWave);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/GYSApp-Tauri/kidung");
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.__catalogueWave))?.sampled,
        { timeout: 15_000 },
      )
      .toBe(true);

    const result = await page.evaluate(() => ({
      wave: window.__catalogueWave,
      firstTitles: window.__firstRenderedTitles ?? [],
    }));
    expect(result.firstTitles).toEqual(["Mapped Hymn", "Unmapped Hymn"]);
    expect(result.wave?.firstWaveMoving).toBe(true);
    expect(result.wave?.animationNames).toEqual([
      "catalogue-row-in",
      "catalogue-row-in",
    ]);
    await expect(page.locator(".kidung-collection-select")).toContainText(
      "English",
    );
    await expect(page.locator(".pujian-title-label")).toHaveText([
      "Mapped Hymn",
      "Unmapped Hymn",
    ]);
  });
});
