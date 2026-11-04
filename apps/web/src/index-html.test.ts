import { describe, expect, it } from "vitest";
import html from "../index.html?raw";

describe("index.html", () => {
  it("does not preload font files that Vite emits with content hashes", () => {
    // The source path cannot be rewritten in a <link href>, so the deployed
    // page asked for /assets/fonts/*.woff2 and got 404 on every route.
    expect(html).not.toMatch(/assets\/fonts\/[^"']+\.woff2/);
  });

  it("keeps the Sauh shelf preload that starts the hero with the document", () => {
    expect(html).toContain("%BASE_URL%offline/sauh.json");
    // Without `crossorigin` the preload is a no-cors fetch while the app's
    // `fetch()` is a CORS fetch: different cache keys, so the browser downloads
    // the 8 KiB shelf twice and the preload buys nothing.
    expect(html).toMatch(
      /rel="preload"\s+href="%BASE_URL%offline\/sauh\.json"\s+as="fetch"\s+crossorigin="anonymous"/,
    );
  });
});
