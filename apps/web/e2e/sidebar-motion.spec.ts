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
    name: /Sembunyikan navigasi|Tampilkan navigasi/,
  });
  await expect(toggle).toBeVisible();

  const measure = async (label: string) =>
    page.evaluate(async (tag: string) => {
      const longTasks: number[] = [];
      const frames: number[] = [];
      const longObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push(entry.duration);
      });
      longObserver.observe({ type: "longtask", buffered: false });
      let last = performance.now();
      let running = true;
      const tick = () => {
        const now = performance.now();
        frames.push(now - last);
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
        frameP95: Math.round(at(0.95) * 10) / 10,
        frameMax: Math.round((sorted.at(-1) ?? 0) * 10) / 10,
        longTasks: longTasks.map((value) => Math.round(value)),
      };
      console.log(`[sidebar-motion] ${JSON.stringify(summary)}`);
      return summary;
    }, label);

  const collapseBaseline = await measure("collapse");
  await toggle.click();
  await expect(page.locator(".workspace.is-sidebar-collapsed")).toHaveCount(1);
  const collapsed = await measure("collapsed");
  await toggle.click();
  await expect(page.locator(".workspace.is-sidebar-collapsed")).toHaveCount(0);
  const expanded = await measure("expanded");

  // Baseline before the toggle must already be quiet; the animated window may
  // cost one frame more, never a stall.
  expect(collapseBaseline.frameMax).toBeLessThan(60);
  expect(collapsed.frameMax).toBeLessThan(120);
  expect(expanded.frameMax).toBeLessThan(120);
});
