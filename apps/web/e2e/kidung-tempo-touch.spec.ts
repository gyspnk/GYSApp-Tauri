import { expect, test } from "@playwright/test";
import { preparePinnedMidiAsset } from "./pinned-reader-fixtures.js";

test("visible Kidung tempo previews a real touch drag and commits on release", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https:\/\//, (route) => route.abort());
  await preparePinnedMidiAsset(page);
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  await page.locator(".hymn-midi-toggle").click();
  await expect(page.locator(".hymn-midi-toggle")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  const player = page.locator(".media-surface.is-kidung-media");
  const toggle = player.getByRole("button", {
    name: "Atur tempo MIDI",
    exact: true,
  });
  await toggle.click();
  const range = player.getByRole("slider", { name: "Tempo MIDI", exact: true });
  const box = (await range.boundingBox())!;
  const before = await toggle.textContent();
  const cdp = await page.context().newCDPSession(page);
  const point = (fraction: number) => ({
    x: box.x + box.width * fraction,
    y: box.y + box.height / 2,
    id: 1,
  });
  let activeTouch = false;
  try {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point(0.25)],
    });
    activeTouch = true;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [point(0.75)],
    });
    await expect
      .poll(async () => Number(await range.inputValue()))
      .toBeGreaterThan(150);
    expect(await toggle.textContent()).toBe(before);
    const selected = await range.inputValue();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    activeTouch = false;
    await expect(toggle).toContainText(selected);
    await toggle.click();
    await toggle.click();
    await expect(range).toHaveValue(selected);
    await range.press("Escape");
    await expect(range).not.toBeVisible();
    await expect(toggle).toBeFocused();
  } finally {
    if (activeTouch)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchCancel",
        touchPoints: [],
      });
    await cdp.detach();
  }
});
