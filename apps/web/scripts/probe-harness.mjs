// Shared browser harness for the throwaway probes this project keeps needing.
//
// Every visual question used to start with the same forty lines: launch
// chromium, seed the shell envelope, abort the network, wait for the route,
// open the disclosure, measure. That boilerplate was written and deleted dozens
// of times, so it lives here instead. Probes stay untracked (probe*.mjs is
// gitignored); this file is the only part that is kept.
//
//   import { withPage } from "./scripts/probe-harness.mjs";
//   await withPage("/lainnya", { theme: "dark" }, async (page) => {
//     console.log(await page.locator(".more-page h1").boundingBox());
//   });
//
// The preview server on 4173 serves apps/web/dist, so run `pnpm --filter
// @gys/web build` after a source change before probing.
import { chromium } from "@playwright/test";

const ORIGIN = "http://127.0.0.1:4173/GYSApp-Tauri";
const BRAVE = /^https:\/\//;

export async function withPage(route, options, run) {
  const {
    viewport = { width: 390, height: 844 },
    theme = "light",
    locale = "id",
    offline = true,
    waitFor,
    settle = 1200,
    reducedMotion,
    // A device that has never opened the app: the welcome screen only appears
    // when no shell envelope exists at all.
    fresh = false,
    // A landscape phone is wider than 768 px but still a thumb. Without this
    // the probe measures the fine-pointer layout and reports 32 px targets that
    // no phone ever sees.
    touch = viewport.width < 768,
    browser: shared,
  } = options ?? {};
  const browser = shared ?? (await chromium.launch());
  const page = await browser.newPage({
    viewport,
    hasTouch: touch,
    isMobile: touch,
    // Playwright's own emulation, so `prefers-reduced-motion` is answered by the
    // browser rather than by a stylesheet the probe has to inject.
    ...(reducedMotion ? { reducedMotion } : {}),
  });
  try {
    await page.addInitScript(
      ({ theme: shellTheme, locale: shellLocale, fresh: blank }) => {
        localStorage.clear();
        if (blank) return;
        localStorage.setItem(
          "gys-shell-settings-v1",
          JSON.stringify({
            version: 1,
            locale: shellLocale,
            theme: shellTheme,
            onboarded: true,
          }),
        );
      },
      { theme, locale, fresh },
    );
    if (offline) await page.route(BRAVE, (request) => request.abort());
    await page.goto(`${ORIGIN}${route}`, { waitUntil: "load" });
    if (waitFor) await page.waitForSelector(waitFor, { timeout: 15_000 });
    if (settle) await page.waitForTimeout(settle);
    return await run(page);
  } finally {
    await page.close();
    if (!shared) await browser.close();
  }
}

/** Opens a settings disclosure by name, e.g. openSetting(page, "appearance"). */
export async function openSetting(page, name) {
  await page.evaluate((key) => {
    const node = document.querySelector(`[data-setting="${key}"]`);
    if (node) node.open = true;
  }, name);
  await page.waitForTimeout(400);
}

/** Returns the painted leaf text nodes under a root with their font sizes. */
export async function textLeaves(page, selector, maxSize = 12) {
  return page.evaluate(
    ({ selector: root, maxSize: limit }) => {
      const host = document.querySelector(root);
      if (!host) return [];
      const out = [];
      for (const node of host.querySelectorAll("*")) {
        if (!node.textContent.trim()) continue;
        if (node.children.length > 0) continue;
        const style = getComputedStyle(node);
        if (style.visibility === "hidden" || style.display === "none") continue;
        const size = Number.parseFloat(style.fontSize);
        if (size >= limit) continue;
        out.push({ size, text: node.textContent.trim().slice(0, 40) });
      }
      return out;
    },
    { selector, maxSize },
  );
}
