import { describe, expect, it } from "vitest";
// @ts-expect-error Vitest uses Node file IO; application types target the browser.
import { readFileSync } from "node:fs";

// Google Identity Services paints its own control inside `.egys-google-button`.
// Stretching that control to the frame (`width/height: 100%`, `padding: 0`)
// collapsed it to one 18 px text line and let the rest of its chrome paint
// over the neighbouring WhatsApp and Apple buttons — the overlap a signed-in
// visitor saw as "the layout is broken". Google must size itself; the frame
// only clips it.
const CSS = readFileSync(
  new URL("./styles/02-bible-and-settings.css", import.meta.url),
  "utf8",
);

function rule(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  expect(start, `missing rule for ${selector}`).toBeGreaterThan(-1);
  return CSS.slice(start, CSS.indexOf("}", start));
}

describe("Google control frame", () => {
  it("clips Google's control instead of flattening it", () => {
    const button = rule(
      '.egys-provider-all .egys-google-control [role="button"]',
    );
    expect(button).not.toMatch(/(?:^|[\s;{])height:\s*100%/m);
    expect(button).not.toMatch(/(?:^|[\s;{])padding:\s*0/m);
    expect(button).toMatch(/max-height:\s*100%/);
  });

  it("keeps the injected node inside the frame", () => {
    const host = rule(".egys-google-control .egys-google-button");
    expect(host).toMatch(/overflow:\s*hidden/);
  });
});
