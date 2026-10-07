/** Follow the same disclosure path as a user, preserving the menu afterward. */
export async function clickMediaStop(page) {
  const surface = page.locator(".media-surface");
  const stop = surface.locator(".media-stop-control");
  const opened = !(await stop.isVisible());
  const summary = surface.locator(".media-advanced-summary");
  if (opened) await summary.click();
  await stop.click();
  if (opened) await summary.click();
}
