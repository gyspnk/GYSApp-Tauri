const APP_NAME = "GYSApp";

/**
 * Title for the document: the page heading plus the app name. Kept pure so the
 * shape is testable without a browser.
 */
export function routeTitle(
  heading: string | null | undefined,
  appName = APP_NAME,
): string {
  const text = heading?.replace(/\s+/g, " ").trim();
  return text ? `${text} · ${appName}` : appName;
}

/**
 * Move focus to the page heading after a client-side navigation, so keyboard
 * and screen-reader users land on the new content instead of the clicked link.
 * Returns the focused heading, or null when the page has none yet.
 */
export function focusRouteHeading(
  container: ParentNode | null,
): HTMLElement | null {
  const heading = container?.querySelector?.("h1");
  if (!(heading instanceof HTMLElement)) return null;
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
  return heading;
}
