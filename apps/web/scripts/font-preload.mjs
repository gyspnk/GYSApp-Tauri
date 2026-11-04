// Fonts are emitted with content hashes, so a hand-written <link rel=preload>
// in index.html can never match (that mistake shipped 404s once already). The
// build knows the real names, so the preloads are injected after `vite build`
// from the emitted asset list. `crossorigin` is required even same-origin:
// fonts are fetched in CORS mode, and a preload without it is fetched twice.
export function pickFontPreloads(files) {
  const pick = (pattern) => files.find((file) => pattern.test(file));
  return [
    pick(/^source-serif-4-[A-Za-z0-9_-]+\.woff2$/),
    pick(/^gys-reading-sans-[A-Za-z0-9_-]+\.woff2$/),
  ].filter((file) => typeof file === "string");
}

export function fontPreloadTags(html, files, base = "/") {
  const links = pickFontPreloads(files)
    .map(
      (file) =>
        `<link rel="preload" href="${base}assets/${file}" as="font" type="font/woff2" crossorigin />`,
    )
    .join("\n    ");
  if (!links) return html;
  return html.replace("</head>", `    ${links}\n  </head>`);
}
