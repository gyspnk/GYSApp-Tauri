import { expect, test } from "@playwright/test";

const widths = [320, 390, 768, 1024, 1440, 1920] as const;
const locales = ["id", "en", "zh"] as const;
const themes = ["light", "dark", "system", "amoled", "sepia"] as const;
const routes = [
  "/",
  "/bible",
  "/kidung",
  "/iman",
  "/literatur",
  "/lainnya",
] as const;
const ready = [
  ".home-grid",
  ".bible-reader",
  ".hymn-catalog-shell",
  ".faith-page",
  ".literature-page",
  ".more-page",
] as const;

// Each case has its own timeout/diagnostics and can be selected or sharded.
for (const width of widths)
  for (const [localeIndex, locale] of locales.entries())
    for (const [themeIndex, theme] of themes.entries()) {
      const routeIndex = (localeIndex * 2 + themeIndex) % routes.length;
      test(`roadmap UI ${width}px ${locale} ${theme} ${routes[routeIndex]}`, async ({
        page,
      }) => {
        await page.setViewportSize({
          width,
          height: width === 320 ? 720 : 900,
        });
        await page.emulateMedia({
          reducedMotion: "reduce",
          colorScheme: "dark",
        });
        await page.addInitScript(
          ({ locale, theme }) =>
            localStorage.setItem(
              "gys-shell-settings-v1",
              JSON.stringify({ version: 1, locale, theme }),
            ),
          { locale, theme },
        );
        await page.goto(`/GYSApp-Tauri${routes[routeIndex]}`);
        await expect(page.locator(ready[routeIndex]!)).toBeVisible();
        await expect(page.locator("h1")).toHaveCount(1);
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
        });
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                document.documentElement.scrollWidth -
                document.documentElement.clientWidth,
            ),
          )
          .toBeLessThanOrEqual(1);
        const targets = page.locator(".navigation-shell .nav-item:visible");
        await expect(targets).toHaveCount(5);
        for (const target of await targets.all()) {
          const box = await target.boundingBox();
          expect(box?.width).toBeGreaterThanOrEqual(44);
          expect(box?.height).toBeGreaterThanOrEqual(44);
          await expect(target).toHaveAccessibleName(/.+/);
        }
        const first = targets.first();
        await first.focus();
        await expect(first).toBeFocused();
        const focus = await first.evaluate(
          (element) => getComputedStyle(element).outlineStyle,
        );
        expect(focus).not.toBe("none");
        expect(
          await page.evaluate(
            () => getComputedStyle(document.documentElement).scrollBehavior,
          ),
        ).toBe("auto");
      });
    }
