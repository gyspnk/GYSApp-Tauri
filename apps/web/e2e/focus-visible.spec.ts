import { expect, test } from "@playwright/test";

// Every control the keyboard reaches must show where the focus went. Axe does
// not audit this, and a stylesheet can lose a ring without anything failing: a
// `.kidung-row-menu > summary:focus-visible` rule once shipped without its
// leading dot, which silently removed the ring from two menus at once.
const SURFACES = [
  { path: "/kidung", settle: 900 },
  { path: "/lainnya", settle: 900 },
  { path: "/bible?book=kejadian&chapter=1", settle: 900 },
];

// Serialised into the page, so it must not close over anything in this module.
const readFocus = () => {
  // A transparent shadow is not a ring, and a ring may live on the wrapper a
  // control paints inside (the search field draws its focus on its container).
  const isShadow = (value: string) =>
    Boolean(value) &&
    value !== "none" &&
    !/\/ 0\)|rgba\(0, 0, 0, 0\)/.test(value);
  const node = document.activeElement as HTMLElement | null;
  if (!node || node === document.body) return null;
  const style = getComputedStyle(node);
  const ownRing =
    (parseFloat(style.outlineWidth) > 0 && style.outlineStyle !== "none") ||
    isShadow(style.boxShadow);
  const parent = node.parentElement;
  const parentStyle = parent ? getComputedStyle(parent) : null;
  const parentRing =
    parentStyle !== null &&
    ((parseFloat(parentStyle.outlineWidth) > 0 &&
      parentStyle.outlineStyle !== "none") ||
      isShadow(parentStyle.boxShadow));
  return {
    tag: node.tagName.toLowerCase(),
    className: [...node.classList].join(".").slice(0, 40),
    label: (node.getAttribute("aria-label") ?? node.textContent ?? "")
      .trim()
      .slice(0, 30),
    ring: ownRing || parentRing,
  };
};

for (const theme of ["light", "dark"] as const) {
  for (const surface of SURFACES) {
    test(`${surface.path} keeps a visible focus ring in the ${theme} shell`, async ({
      page,
    }) => {
      await page.addInitScript((shell) => {
        localStorage.setItem(
          "gys-shell-settings-v1",
          JSON.stringify({
            version: 1,
            locale: "id",
            theme: shell,
            onboarded: true,
          }),
        );
      }, theme);
      await page.route(/^https:\/\//, (route) => route.abort());
      await page.goto(`/GYSApp-Tauri${surface.path}`);
      await expect(page.locator("main h1").first()).toBeAttached();
      await page.waitForTimeout(surface.settle);

      const missing: unknown[] = [];
      for (let step = 0; step < 12; step += 1) {
        await page.keyboard.press("Tab");
        // Rings fade in, so read after the transition rather than at 0 ms.
        await page.waitForTimeout(140);
        const focus = await page.evaluate(readFocus);
        if (focus && !focus.ring) missing.push(focus);
      }
      expect(missing, "controls that took focus without a ring").toEqual([]);
    });
  }
}
