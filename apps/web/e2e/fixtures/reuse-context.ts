import { test as base, expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";

/**
 * Experimental fixture for read-only specs: one browser context per worker, a
 * fresh page per test. Pages in the same context share the HTTP cache and the
 * V8 code cache, so a page load that normally costs ~0.8s can skip part of it.
 *
 * Isolation is kept by clearing storage and cookies after every test. Use it
 * only in specs that do not rely on `page.context()` or per-test `test.use`
 * context options (viewport, touch, locale).
 */
export const test = base.extend<
  { page: Page },
  { sharedContext: BrowserContext }
>({
  sharedContext: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      await use(context);
      await context.close();
    },
    { scope: "worker" },
  ],
  page: async ({ sharedContext }, use) => {
    const page = await sharedContext.newPage();
    await use(page);
    await page
      .evaluate(() => {
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch {
          // About:blank or a closed page: nothing to clear.
        }
      })
      .catch(() => undefined);
    await page.close();
    await sharedContext.clearCookies();
  },
});

export { expect };
