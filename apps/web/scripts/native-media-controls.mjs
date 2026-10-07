/** Native focus() can return before an entering disclosure is focusable. */
export async function focusMediaControl(control) {
  await control.evaluate(
    (element) =>
      new Promise((resolve, reject) => {
        const started = performance.now();
        const focus = () => {
          element.focus({ preventScroll: true });
          if (document.activeElement === element) resolve();
          else if (performance.now() - started > 5_000)
            reject(new Error("Media control did not become focusable"));
          else requestAnimationFrame(focus);
        };
        focus();
      }),
  );
}

/** Follow the same disclosure path as a user, preserving the menu afterward. */
export async function clickMediaStop(page) {
  const surface = page.locator(".media-surface");
  await surface.waitFor({ state: "visible" });
  const classes = await surface.getAttribute("class");
  if (classes.includes("is-minimized"))
    await surface.locator(".media-minimize").click();
  const advanced = surface.locator(".media-advanced-controls");
  if (classes.includes("is-kidung-media"))
    await advanced.waitFor({ state: "attached" });
  const stop = surface.locator(".media-stop-control");
  const opened =
    (await advanced.count()) > 0 &&
    !(await advanced.evaluate((element) => element.open));
  const summary = surface.locator(".media-advanced-summary");
  if (opened) await summary.click();
  await stop.click();
  if (opened) await summary.click();
}
