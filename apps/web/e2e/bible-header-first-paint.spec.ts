import { expect, test } from "@playwright/test";

// The owner saw the reader bar paint a line of text ("Bacaan / Alkitab") and
// then replace it with the real controls on every cold open. The bar now
// renders the same control shapes disabled from the first frame, so nothing
// moves and no text appears where a button belongs.
for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`the reader bar paints controls, never text, at ${viewport.width}`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "gys-shell-settings-v1",
        JSON.stringify({
          version: 1,
          locale: "id",
          theme: "light",
          onboarded: true,
        }),
      );
      // Sample every frame from the first paint: a text frame that only lives
      // for 200 ms is invisible to a locator assertion.
      const frames: { text: string; buttons: number }[] = [];
      (window as unknown as { __barFrames: typeof frames }).__barFrames =
        frames;
      const sample = () => {
        const bar = document.querySelector(".reader-context-bar");
        if (bar) {
          frames.push({
            text: (bar.textContent ?? "").trim(),
            buttons: bar.querySelectorAll("button").length,
          });
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.setViewportSize(viewport);
    await page.goto("/GYSApp-Tauri/bible?book=kejadian&chapter=1", {
      waitUntil: "load",
    });
    await expect(page.getByRole("heading", { name: /Kejadian 1/ })).toBeVisible(
      { timeout: 30_000 },
    );

    const frames = await page.evaluate(
      () =>
        (
          window as unknown as {
            __barFrames: { text: string; buttons: number }[];
          }
        ).__barFrames,
    );
    expect(frames.length).toBeGreaterThan(0);
    // Every frame that painted a bar carried buttons; none of them showed the
    // placeholder words the old fallback printed.
    for (const frame of frames) {
      expect(frame.buttons, `frame text: ${frame.text}`).toBeGreaterThan(0);
      expect(frame.text).not.toContain("Bacaan");
      expect(frame.text).not.toContain("Alkitab");
    }
  });
}
