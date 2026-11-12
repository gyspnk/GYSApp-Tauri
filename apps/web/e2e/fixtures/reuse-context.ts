import { test as base, expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { ONBOARDED_ENVELOPE, ONBOARDED_STATE } from "./onboarded-state.js";

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
      // The shared context bypasses the config-level storage state, so the
      // returning-reader envelope is applied here explicitly.
      const context = await browser.newContext({
        storageState: ONBOARDED_STATE,
      });
      await use(context);
      await context.close();
    },
    { scope: "worker" },
  ],
  page: async ({ sharedContext }, use) => {
    const page = await sharedContext.newPage();
    await use(page);
    await page
      .evaluate((envelope) => {
        try {
          localStorage.clear();
          sessionStorage.clear();
          // The shared context lives across tests, so the returning-reader
          // envelope has to be put back for the next page.
          localStorage.setItem("gys-shell-settings-v1", envelope);
        } catch {
          // About:blank or a closed page: nothing to clear.
        }
      }, ONBOARDED_ENVELOPE)
      .catch(() => undefined);
    await page.close();
    await sharedContext.clearCookies();
  },
});

export { expect };
