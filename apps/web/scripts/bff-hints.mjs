// The Sauh page cannot paint its hero until the live post arrives, and that
// request used to start only after the entry chunk, the locale table and the
// route chunk had run (~2 s on a slow link). Hinting the JSON from the HTML
// head starts it during parse instead, so the hero image can be requested a
// second and a half earlier. Only the hosted build knows the BFF origin, so
// local builds stay untouched.

/** Absolute BFF origin for <link rel=preconnect>, or null when unconfigured. */
export function bffOrigin(base) {
  const trimmed = (base ?? "").trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

/** The Sauh JSON the home and /sauh shells should preload. */
export function sauhPreloadUrl(base) {
  const origin = bffOrigin(base);
  return origin ? `${origin}/api/v1/content/sauh` : null;
}

/** Tags injected at the end of <head>; empty when no BFF is configured. */
export function bffHintTags(base) {
  const origin = bffOrigin(base);
  const preload = sauhPreloadUrl(base);
  if (!origin || !preload) return "";
  return [
    `<link rel="preconnect" href="${origin}" crossorigin />`,
    `<link rel="preload" as="fetch" href="${preload}" crossorigin="anonymous" />`,
  ].join("\n    ");
}

/** Insert the tags before </head>; returns the input when there is no head. */
export function injectBffHints(html, base) {
  const tags = bffHintTags(base);
  if (!tags) return html;
  const index = html.lastIndexOf("</head>");
  if (index < 0) return html;
  return `${html.slice(0, index)}  ${tags}\n  ${html.slice(index)}`;
}

/** Preconnect only: every route shows BFF-proxied images, so warm the origin. */
export function injectBffPreconnect(html, base) {
  const origin = bffOrigin(base);
  if (!origin) return html;
  const index = html.lastIndexOf("</head>");
  if (index < 0) return html;
  const tag = `<link rel="preconnect" href="${origin}" crossorigin />`;
  return `${html.slice(0, index)}  ${tag}\n  ${html.slice(index)}`;
}

/**
 * The Suara library paints from the bundled snapshot and only revalidates the
 * live BFF feed afterwards. Without a head hint that snapshot fetch started
 * after boot (~3,4 s on a slow link), so the first covers were requested at
 * ~6,2 s. crossorigin="anonymous" mirrors the app's fetch credentials mode —
 * a preload with a different mode is downloaded twice.
 */
export function injectSuaraHints(html, bffBase, rootBase = "/") {
  const origin = bffOrigin(bffBase);
  const root = (rootBase ?? "").trim();
  if (!origin || !root.endsWith("/")) return html;
  const index = html.lastIndexOf("</head>");
  if (index < 0) return html;
  const tags = [
    `<link rel="preconnect" href="${origin}" crossorigin />`,
    `<link rel="preload" as="fetch" href="${root}offline/suara-sejati.json" crossorigin="anonymous" />`,
  ].join("\n    ");
  return `${html.slice(0, index)}  ${tags}\n  ${html.slice(index)}`;
}
