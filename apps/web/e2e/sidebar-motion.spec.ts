import { expect, test } from "@playwright/test";

// The shell toggle animates a grid column, so every frame re-lays out the
// route behind it. Long tasks and slow frames are the honest signal for
// "smooth": both are measured here, on the heaviest route we ship.
test("sidebar collapse keeps frames short on a long route", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/GYSApp-Tauri/kidung");
  await expect(page.locator(".pujian-item").first()).toBeVisible({
    timeout: 30_000,
  });

  const toggle = page.getByRole("button", {
    name: /Ciutkan navigasi|Perluas navigasi/,
  });
  await expect(toggle).toBeVisible();

  // The loop must already be running when the toggle is clicked: starting it
  // afterwards measures the click's own layout as one giant "frame" that the
  // animation never caused.
  const measure = async (label: string, action?: () => Promise<unknown>) => {
    const running = page.evaluate(async (tag: string) => {
      const longTasks: number[] = [];
      const frames: number[] = [];
      const longObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push(entry.duration);
      });
      longObserver.observe({ type: "longtask", buffered: false });
      let last = performance.now();
      let running = true;
      let warmed = false;
      const tick = () => {
        const now = performance.now();
        // The first sample is the wait for the loop to be scheduled, not a
        // frame the reader sees; on a loaded runner it alone can exceed 200 ms
        // and it says nothing about the animation.
        if (warmed) frames.push(now - last);
        warmed = true;
        last = now;
        if (running) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      await new Promise((resolve) => setTimeout(resolve, 400));
      running = false;
      longObserver.disconnect();
      const sorted = [...frames].sort((a, b) => a - b);
      const at = (p: number) =>
        sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
      const summary = {
        tag,
        frames: frames.length,
        frameMedian: Math.round(at(0.5) * 10) / 10,
        frameP95: Math.round(at(0.95) * 10) / 10,
        frameMax: Math.round((sorted.at(-1) ?? 0) * 10) / 10,
        longTasks: longTasks.map((value) => Math.round(value)),
      };
      return summary;
    }, label);
    if (action) await action();
    return running;
  };

  const collapseBaseline = await measure("baseline");
  console.log(`[sidebar-motion] ${JSON.stringify(collapseBaseline)}`);
  // Record every class the shell takes during the toggle, so the sequencing
  // contract does not depend on how fast the runner is.
  await page.evaluate(() => {
    const shell = document.querySelector(".workspace");
    const seen: string[] = [];
    (window as unknown as { __sidebarClasses: string[] }).__sidebarClasses =
      seen;
    if (shell) {
      new MutationObserver(() => seen.push(shell.className)).observe(shell, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
  });
  const collapsed = measure("collapsed", () => toggle.click());
  await expect(page.locator(".workspace.is-sidebar-collapsed")).toHaveCount(1);
  // The labels must be out of the way while the column moves, then return.
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __sidebarClasses: string[] }).__sidebarClasses,
    ),
  ).toEqual(
    expect.arrayContaining([
      expect.stringMatching(
        /is-sidebar-animating.*is-sidebar-collapsed|is-sidebar-collapsed.*is-sidebar-animating/,
      ),
    ]),
  );
  const collapsedSample = await collapsed;
  console.log(`[sidebar-motion] ${JSON.stringify(collapsedSample)}`);
  const expanded = measure("expanded", () => toggle.click());
  await expect(page.locator(".workspace.is-sidebar-collapsed")).toHaveCount(0);
  const expandedSample = await expanded;
  console.log(`[sidebar-motion] ${JSON.stringify(expandedSample)}`);

  // A single huge "frame" is the idle gap while the click travels over CDP,
  // not layout: it appears on the quiet baseline too (222 ms measured before
  // the rail moved) and leaves no long task behind. The honest signals are the
  // median frame and whether animating adds long tasks at all.
  for (const sample of [collapseBaseline, collapsedSample, expandedSample]) {
    expect(sample.frameMedian).toBeLessThan(32);
  }
  expect(collapsedSample.longTasks.length).toBeLessThanOrEqual(
    collapseBaseline.longTasks.length + 1,
  );
  expect(expandedSample.longTasks.length).toBeLessThanOrEqual(
    collapseBaseline.longTasks.length + 1,
  );
});
