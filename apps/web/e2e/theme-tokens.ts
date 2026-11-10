import type { Page } from "@playwright/test";

/**
 * The colour a design token resolves to in the current theme.
 *
 * Reading the token instead of a hex keeps a surface contract ("this control
 * paints the brand accent") separate from the palette itself, which
 * `apps/web/src/editorial-palette.test.ts` owns and tunes.
 */
export async function tokenColor(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, token);
}
