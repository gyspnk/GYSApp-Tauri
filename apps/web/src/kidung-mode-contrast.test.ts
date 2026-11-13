// @ts-expect-error Vitest uses Node file IO; application types target the browser.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The catalogue's mode button paints its label on --blue when it is pressed.
// --blue is a pale #7fc6e8 in dark and amoled, so a literal white label there
// measures ~1.6:1. The label must use --on-accent, which flips with the surface.
const css = readFileSync(new URL("./kidung-ux.css", import.meta.url), "utf8");

function ruleFor(selector: string) {
  const index = css.indexOf(`${selector} {`);
  expect(index, `missing rule for ${selector}`).toBeGreaterThanOrEqual(0);
  const end = css.indexOf("}", index);
  return css.slice(index, end);
}

describe("kidung mode button", () => {
  it("paints the pressed label with the accent-safe token, not white", () => {
    const pressed = ruleFor('.kidung-mode-cycle[aria-pressed="true"]');
    expect(pressed).toContain("color: var(--on-accent)");
    expect(pressed).not.toMatch(/color:\s*#fff/i);
  });

  it("keeps the hover label on the same token", () => {
    const hover = ruleFor('.kidung-mode-cycle[aria-pressed="true"]:hover');
    expect(hover).toContain("color: var(--on-accent)");
    expect(hover).not.toMatch(/color:\s*#fff/i);
  });

  it("gives the row menu summary a real focus ring", () => {
    // A missing leading dot used to invalidate this whole selector list, so the
    // row menu and the PDF music menu had no focus outline at all.
    expect(css).toContain(".kidung-row-menu > summary:focus-visible,");
    expect(css).not.toMatch(/^kidung-row-menu > summary:focus-visible,/m);
  });
});
