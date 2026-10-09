import { preparePinnedReaderAssets } from "./pinned-reader-fixtures.js";
import { createHash } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("catalog queue status updates immediately without changing search", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/kidung");
  const first = page.locator(".add-to-playlist-btn").first();
  await expect(first).toBeVisible();
  await expect(first).toHaveAttribute("aria-pressed", "false");
  const originalLabel = await first.getAttribute("aria-label");
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(first).not.toHaveAttribute("aria-label", originalLabel!);
  await expect(page.locator(".kidung-local-nav a small")).toHaveText("1");
  await first.click();
  await expect(page.locator(".kidung-local-nav a small")).toHaveText("1");
  await page.reload();
  await expect(first).toHaveAttribute("aria-pressed", "true");
});

type TestMediaSessionWindow = Window & {
  __gysMediaSession?: {
    handlers: Record<string, (details?: unknown) => unknown>;
    metadata: { album?: string; title?: string } | null;
    playbackState: string;
  };
};

// Contextual menus retain 44px targets; the persistent dock uses compact 36px controls (40px on phones).
async function expectTarget(locator: Locator, min = 44) {
  const box = await locator.boundingBox();
  expect(box, "control should be visible and measurable").not.toBeNull();
  await expect
    .poll(async () => (await locator.boundingBox())?.width ?? 0)
    .toBeGreaterThanOrEqual(min - 0.5);
  await expect
    .poll(async () => (await locator.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(min - 0.5);
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
}

async function expectLyricsGeometry(panel: Locator, page: Page) {
  const controls = panel.locator(
    "button:visible, input:visible, select:visible",
  );
  const controlCount = await controls.count();
  expect(controlCount).toBeGreaterThan(15);
  for (let index = 0; index < controlCount; index += 1)
    await expectTarget(controls.nth(index));

  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const boxes = await controls.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom };
    }),
  );
  for (const box of boxes) {
    expect(box.x).toBeGreaterThanOrEqual(-0.5);
    expect(box.y).toBeGreaterThanOrEqual(-0.5);
    expect(box.right).toBeLessThanOrEqual(viewport.width + 0.5);
    expect(box.bottom).toBeLessThanOrEqual(viewport.height + 0.5);
  }

  const headerRegions = await panel
    .locator(".lyrics-title, .lyrics-transport, .lyrics-header-actions")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return {
          left: box.left,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
        };
      }),
    );
  for (let left = 0; left < headerRegions.length; left += 1) {
    for (let right = left + 1; right < headerRegions.length; right += 1) {
      const a = headerRegions[left]!;
      const b = headerRegions[right]!;
      const overlaps =
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      expect(overlaps, `header regions ${left}/${right} must not overlap`).toBe(
        false,
      );
    }
  }
}

async function expectMediaDockGeometry(media: Locator, viewportWidth: number) {
  const geometry = await media.evaluate((element) => {
    const rect = (selector: string) => {
      const node =
        selector === ":scope"
          ? element
          : element.querySelector<HTMLElement>(selector);
      const box = node?.getBoundingClientRect();
      return box
        ? { x: box.x, y: box.y, width: box.width, height: box.height }
        : null;
    };
    return {
      media: rect(":scope"),
      transport: rect(":scope > .media-transport-controls"),
      previous: rect(
        ":scope > .media-transport-controls .media-previous-control",
      ),
      play: rect(":scope > .media-transport-controls .media-primary-control"),
      next: rect(":scope > .media-transport-controls .media-next-control"),
      minimize: rect(":scope > .media-minimize"),
      advanced: rect(".media-advanced-summary"),
      title: rect(".media-meta"),
    };
  });

  for (const name of [
    "media",
    "transport",
    "play",
    "minimize",
    "advanced",
  ] as const) {
    expect(geometry[name], `${name} should stay measurable`).not.toBeNull();
  }

  for (const name of ["previous", "play", "next", "minimize", "advanced"]) {
    const box = geometry[name as keyof typeof geometry];
    if (!box) continue; // Queue navigation is absent for a single song.
    expect(box.width, `${name} width`).toBeGreaterThanOrEqual(36 - 0.5);
    expect(box.height, `${name} height`).toBeGreaterThanOrEqual(36 - 0.5);
  }

  const controls = [geometry.previous!, geometry.play!, geometry.next!].filter(
    (box) => box !== null,
  );
  expect(
    Math.max(...controls.map((box) => box.y)) -
      Math.min(...controls.map((box) => box.y)),
  ).toBeLessThan(1.5);
  const rowAnchor =
    viewportWidth <= 600 ? geometry.title! : geometry.transport!;
  expect(
    Math.abs(
      geometry.minimize!.y +
        geometry.minimize!.height / 2 -
        rowAnchor.y -
        rowAnchor.height / 2,
    ),
  ).toBeLessThan(1.5);
  expect(geometry.media!.x + geometry.media!.width).toBeLessThanOrEqual(
    viewportWidth,
  );
}

async function openCatalog(page: Page) {
  await page.goto("/GYSApp-Tauri/kidung");
  await expect(page).toHaveURL(/\/kidung$/);
  await expect(
    page.getByRole("heading", { name: "Kidung", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await page
    .locator(".pujian-list > li")
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
}

async function openFirstHymn(page: Page) {
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  await expect(
    page.getByRole("heading", { name: "Pujilah Allah Yang Maha Esa" }),
  ).toBeVisible({ timeout: 20_000 });
}

async function openPlaylistWithSong(page: Page) {
  await openCatalog(page);
  await page.locator(".add-to-playlist-btn").first().click();
  await page.goto("/GYSApp-Tauri/kidung?section=playlist");
  await page
    .locator(".kidung-playlist-list > li")
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
}

async function openFirstHymnPdf(page: Page) {
  await openFirstHymn(page);
  await page.locator(".hymn-partitur-toggle").click();
  await page.locator(".gys-pdf-overlay").waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await page.locator(".pdf-reader").waitFor({
    state: "visible",
    timeout: 30_000,
  });

  const renderedPage = page
    .locator('.pdf-reader canvas[data-pdf-rendered="true"]')
    .first();
  await expect(renderedPage).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      () =>
        renderedPage.evaluate((canvas) => {
          const pageCanvas = canvas as HTMLCanvasElement;
          return pageCanvas.width > 0 && pageCanvas.height > 0;
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
  await expect(page.locator(".gys-pdf-overlay > .loading-panel")).toHaveCount(
    0,
  );
}

const MIDI_FIXTURE = Buffer.from([
  0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01,
  0xe0, 0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x17, 0x00, 0xff, 0x51, 0x03,
  0x07, 0xa1, 0x20, 0x00, 0xc0, 0x00, 0x00, 0x90, 0x3c, 0x64, 0x83, 0x60, 0x80,
  0x3c, 0x40, 0x00, 0xff, 0x2f, 0x00,
]);
const MIDI_NEXT_FIXTURE = Buffer.from([
  0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01,
  0xe0, 0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x17, 0x00, 0xff, 0x51, 0x03,
  0x07, 0xa1, 0x20, 0x00, 0xc0, 0x00, 0x00, 0x90, 0x3c, 0x64, 0xcb, 0x00, 0x80,
  0x3c, 0x40, 0x00, 0xff, 0x2f, 0x00,
]);
const MIDI_NEXT_FIXTURE_HASH = createHash("sha256")
  .update(MIDI_NEXT_FIXTURE)
  .digest("hex");

async function prepareMidiDockFixture(page: Page, firstMidi = MIDI_FIXTURE) {
  const firstHash = createHash("sha256").update(firstMidi).digest("hex");
  await preparePinnedReaderAssets(page);
  await page.addInitScript(() => {
    localStorage.setItem("gys-media-minimized", "0");
    const handlers: Record<string, (details?: unknown) => unknown> = {};
    const mediaSession = {
      handlers,
      metadata: null as { album?: string; title?: string } | null,
      playbackState: "none",
      setActionHandler(
        action: string,
        handler: ((details?: unknown) => unknown) | null,
      ) {
        if (handler) handlers[action] = handler;
        else delete handlers[action];
      },
      setPositionState() {},
    };
    Object.defineProperty(window, "__gysMediaSession", {
      configurable: true,
      value: mediaSession,
    });
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: mediaSession,
    });
  });
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/offline/music-lock.json")) {
      try {
        const response = await route.fetch();
        const lock = (await response.json()) as {
          items: Array<{
            kind: string;
            path: string;
            size: number;
            sha256: string;
          }>;
        };
        const fixtures = new Map([
          [
            "assets/midi/001_Pujilah Allah Yang Maha Esa.mid",
            { bytes: firstMidi, hash: firstHash },
          ],
          [
            "assets/midi/002_Pujilah Allah Yang Mahakudus.mid",
            { bytes: MIDI_NEXT_FIXTURE, hash: MIDI_NEXT_FIXTURE_HASH },
          ],
        ]);
        for (const item of lock.items) {
          if (item.kind !== "midi") continue;
          const fixture = fixtures.get(item.path);
          if (!fixture) continue;
          item.size = fixture.bytes.byteLength;
          item.sha256 = fixture.hash;
        }
        await route.fulfill({ json: lock });
      } catch {
        await route.continue().catch(() => undefined);
      }
      return;
    }
    if (/\.mid(?:\?|$)/i.test(url) || url.includes("/api/v1/content/music")) {
      const bytes = url.includes("002_Pujilah")
        ? MIDI_NEXT_FIXTURE
        : firstMidi;
      await route.fulfill({
        body: bytes,
        headers: { "content-type": "application/octet-stream" },
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/GYSApp-Tauri/");
  await page.evaluate(async () => {
    const cacheName = "gys-distributed-v1-GeneralUser-GS-e2e";
    const cacheKey =
      "https://gysapp.local/distributed-assets/GeneralUser-GS/e2e";
    const cache = await caches.open(cacheName);
    await cache.put(cacheKey, new Response(new Uint8Array([0])));
    localStorage.setItem(
      "gys-distributed-assets-v1",
      JSON.stringify({
        "GeneralUser-GS": {
          code: "GeneralUser-GS",
          kind: "soundfont",
          version: "e2e",
          releaseTag: "e2e",
          installFileName: "GeneralUser-GS.sf2",
          packageSizeBytes: 1,
          packageChecksumSha256: "e2e",
          cacheName,
          cacheKey,
          payloadBytes: 1,
          installedAt: "2026-09-20T00:00:00.000Z",
        },
      }),
    );
  });
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  await expect(page.locator(".hymn-midi-toggle")).toBeVisible({
    timeout: 20_000,
  });
  await page.locator(".hymn-midi-toggle").click();
  await expect(page.locator(".media-surface.is-kidung-media")).toBeVisible({
    timeout: 20_000,
  });
}

test("Kidung MIDI dock keeps core playback visible and discloses advanced controls", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await prepareMidiDockFixture(page);

  for (const viewport of [
    { width: 320, height: 720, name: "small-phone" },
    { width: 390, height: 844, name: "phone" },
    { width: 768, height: 1024, name: "tablet" },
    { width: 1440, height: 900, name: "desktop" },
  ]) {
    await page.setViewportSize(viewport);
    const media = page.locator(".media-surface.is-kidung-media");
    const advanced = media.locator(".media-advanced-controls");
    const queueBadge = media.locator(".media-queue-badge");
    await expect(queueBadge).toBeHidden();
    await expect(media.locator(".media-transport-controls")).toBeVisible();
    await expect(media.locator(".media-stop-control")).toBeHidden();
    await expect(media.locator(".media-mute-control")).toBeHidden();
    await expect(media.locator(".media-minimize")).toBeVisible();
    await expect(advanced).not.toHaveAttribute("open", "");
    await expect(media.locator(".media-advanced-summary")).toBeVisible();
    await expectMediaDockGeometry(media, viewport.width);
    await expectNoHorizontalOverflow(page);

    await page.screenshot({
      path: `test-results/ui-preview/kidung-density/media-dock-${viewport.name}.png`,
      fullPage: false,
      animations: "disabled",
    });

    const summary = media.locator(".media-advanced-summary");
    await summary.click();
    await expect(advanced).toHaveAttribute("open", "");
    const panelBox = await media.locator(".media-advanced-panel").boundingBox();
    const dockBox = await media.boundingBox();
    expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(dockBox!.y);
    await expect(queueBadge).toBeVisible();
    await expect(media.getByRole("combobox", { name: "Instrumen MIDI" })).toBeVisible();
    for (const control of await media
      .locator(".media-advanced-panel button, .media-advanced-panel select")
      .all()) {
      await expectTarget(control);
    }
    await expectNoHorizontalOverflow(page);
    await summary.click();
    await expect(queueBadge).toBeHidden();
  }
});

test("MIDI auto-advance loads the next queued song when playback ends", async ({
  page,
}) => {
  test.setTimeout(30_000);
  await page.addInitScript(() => {
    localStorage.setItem(
      "gys-midi-playlist-v1",
      JSON.stringify({
        version: 1,
        items: [
          { songId: "hymn-001", title: "Pujilah Allah Yang Maha Esa" },
          { songId: "hymn-002", title: "Pujilah Allah Yang Mahakudus" },
        ],
        currentIndex: 0,
        loop: "all",
        shuffle: false,
        autoNext: true,
        autoNextMode: "playlist",
        crossfadeMs: 0,
      }),
    );
  });
  await prepareMidiDockFixture(page);

  const title = page.locator(
    ".media-surface.is-kidung-media .media-context-link strong",
  );
  await expect(title).toHaveText("Pujilah Allah Yang Maha Esa");
  await page
    .locator(".media-surface.is-kidung-media .media-primary-control")
    .click();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const stored = localStorage.getItem("gys-midi-playlist-v1");
          return stored ? JSON.parse(stored).currentIndex : -1;
        }),
      { timeout: 15_000 },
    )
    .toBe(1);
  await expect(title).toHaveText("Pujilah Allah Yang Mahakudus", {
    timeout: 15_000,
  });
});

test("MIDI dock transport and sound controls update playback state", async ({
  page,
}) => {
  test.setTimeout(35_000);
  await prepareMidiDockFixture(page);
  await page.locator(".hymn-midi-toggle").click();
  await page.goto("/GYSApp-Tauri/kidung/hymn-002?mode=lyrics");
  await page.locator(".hymn-midi-toggle").click();

  const media = page.locator(".media-surface.is-kidung-media");
  const play = media.locator(".media-primary-control");
  const position = media.getByLabel("Posisi MIDI");
  await expect(page.locator(".hymn-midi-toggle")).toHaveAttribute("aria-busy", "false");
  await expect(media.locator(".media-load-track")).toHaveCount(0);
  await expect(position).toHaveAttribute("max", "10");
  // This test edits musical controls after the pinned song's PDF defaults.
  // A separate player regression covers defaults arriving during playback.
  await expect(media.locator(".media-advanced-summary")).toContainText("88 BPM", {
    timeout: 15_000,
  });
  await play.click();
  // The first play lazily compiles WASM and renders real PCM on hosted CPUs.
  await expect(play).toHaveAttribute("aria-label", "Jeda", { timeout: 15_000 });
  await position.focus();
  await position.press("ArrowRight");
  await expect
    .poll(() => position.inputValue().then(Number))
    .toBeGreaterThan(0);

  await media.locator(".media-advanced-summary").click();
  const volume = media.getByLabel("Volume MIDI");
  await volume.focus();
  await volume.press("ArrowLeft");
  await expect(volume).toHaveValue("0.69");
  const mute = media.locator(".media-mute-control");
  await mute.click();
  await expect(mute).toHaveAttribute("aria-pressed", "true");
  await mute.click();
  await expect(mute).toHaveAttribute("aria-pressed", "false");

  await media.locator(".media-advanced-summary").click();
  const transpose = media.locator(".media-transpose");
  const initialTranspose = Number(await transpose.locator("strong").textContent());
  await transpose.getByRole("button", { name: "Naikkan nada", exact: true }).click();
  const nextTranspose = initialTranspose + 1;
  await expect(transpose.locator("strong")).toHaveText(nextTranspose > 0 ? `+${nextTranspose}` : String(nextTranspose));
  const instrument = media.locator(".media-instrument-control").getByRole("combobox");
  await instrument.click();
  await media.getByRole("option", { name: /Violin/ }).click();
  await expect(instrument).toHaveText("Violin");
  await media.locator(".media-advanced-summary").click();
  await media.locator(".media-tempo-toggle").click();
  const tempo = media.locator(".media-tempo-popover input");
  const currentTempo = Number(await tempo.inputValue());
  await tempo.focus();
  await tempo.press("ArrowRight");
  await expect(tempo).toHaveValue(String(currentTempo + 1));
  await expect(media.locator(".media-tempo-popover")).toContainText(
    `${currentTempo + 1} BPM`,
  );

  await media.locator(".media-stop-control").click();
  await expect(play).toHaveAttribute("aria-label", "Putar");
});

test("MIDI Media Session publishes metadata and routes system transport actions", async ({
  page,
}) => {
  test.setTimeout(35_000);
  await page.addInitScript(() => {
    localStorage.setItem(
      "gys-midi-playlist-v1",
      JSON.stringify({
        version: 1,
        items: [
          { songId: "hymn-001", title: "Pujilah Allah Yang Maha Esa" },
          { songId: "hymn-002", title: "Pujilah Allah Yang Mahakudus" },
        ],
        currentIndex: 0,
        loop: "all",
        shuffle: false,
        autoNext: true,
        autoNextMode: "playlist",
        crossfadeMs: 0,
      }),
    );
  });
  // Keep the first note sustained: automatic end-of-track advancement must
  // not race this test of explicit play/pause/next transport commands.
  await prepareMidiDockFixture(page, MIDI_NEXT_FIXTURE);

  const title = page.locator(
    ".media-surface.is-kidung-media .media-context-link strong",
  );
  await expect(title).toHaveText("Pujilah Allah Yang Maha Esa");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const session = (window as TestMediaSessionWindow).__gysMediaSession;
        return {
          album: session?.metadata?.album,
          handlers: Object.keys(session?.handlers ?? {}).sort(),
          title: session?.metadata?.title,
        };
      }),
    )
    .toMatchObject({
      album: "Kidung Rohani",
      title: "Pujilah Allah Yang Maha Esa",
    });
  const actions = await page.evaluate(() =>
    Object.keys(
      (window as TestMediaSessionWindow).__gysMediaSession?.handlers ?? {},
    ),
  );
  expect(actions).toEqual(
    expect.arrayContaining([
      "play",
      "pause",
      "stop",
      "previoustrack",
      "nexttrack",
      "seekto",
      "seekbackward",
      "seekforward",
    ]),
  );

  const runAction = async (action: string) =>
    page.evaluate(async (actionName) => {
      const handler = (window as TestMediaSessionWindow).__gysMediaSession
        ?.handlers[actionName];
      await handler?.();
    }, action);
  await runAction("play");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestMediaSessionWindow).__gysMediaSession?.playbackState,
      ),
    )
    .toBe("playing");
  await runAction("pause");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestMediaSessionWindow).__gysMediaSession?.playbackState,
      ),
    )
    .toBe("paused");
  await runAction("play");
  await runAction("nexttrack");
  await expect(title).toHaveText("Pujilah Allah Yang Mahakudus", {
    timeout: 15_000,
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestMediaSessionWindow).__gysMediaSession?.metadata?.title,
      ),
    )
    .toBe("Pujilah Allah Yang Mahakudus");
  await runAction("stop");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestMediaSessionWindow).__gysMediaSession?.playbackState,
      ),
    )
    .toBe("paused");
});

test("Kidung desktop dock keeps metadata and adjustments in compact bands", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await prepareMidiDockFixture(page);

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    const media = page.locator(".media-surface.is-kidung-media");
    const main = media.locator(":scope > .media-main");
    await expect(main).toBeVisible();

    const geometry = await media.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        height: rect.height,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      };
    });

    expect(
      geometry.height,
      `${viewport.width}px dock height`,
    ).toBeLessThanOrEqual(128);
    expect(
      geometry.scrollWidth,
      `${viewport.width}px dock content width`,
    ).toBeLessThanOrEqual(geometry.clientWidth);
  }
});

test("wide Kidung catalog shares navigation and filters in one top row", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1241, height: 958 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await openCatalog(page);

    const topbar = page.locator(".kidung-index-toolbar");
    const nav = topbar.locator(".kidung-controls-field");
    const header = topbar.locator(".hymn-page-header");
    await expect(topbar).toBeVisible();
    await expect(nav).toBeVisible();
    await expect(header).toBeVisible();

    const geometry = await topbar.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const nav = element.querySelector<HTMLElement>(".kidung-controls-field")!;
      const header = element.querySelector<HTMLElement>(".hymn-page-header")!;
      const navBox = nav.getBoundingClientRect();
      const headerBox = header.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        wrapper: {
          top: rect.top,
          bottom: rect.bottom,
          height:
            rect.height -
            parseFloat(style.paddingTop) -
            parseFloat(style.paddingBottom),
        },
        nav: { top: navBox.top, bottom: navBox.bottom, height: navBox.height },
        header: {
          top: headerBox.top,
          bottom: headerBox.bottom,
          height: headerBox.height,
        },
      };
    });

    if (viewport.width >= 1200) {
      expect(
        Math.abs(
          (geometry.nav.top + geometry.nav.bottom) / 2 -
            (geometry.header.top + geometry.header.bottom) / 2,
        ),
      ).toBeLessThanOrEqual(2);
      expect(geometry.wrapper.height).toBeLessThanOrEqual(
        Math.max(geometry.nav.height, geometry.header.height) + 2,
      );
    } else {
      expect(geometry.header.top).toBeGreaterThanOrEqual(
        geometry.nav.bottom - 1,
      );
    }

    for (const control of await topbar
      .locator("a, input, .control-select-trigger")
      .all()) {
      if (await control.isVisible()) await expectTarget(control);
    }
    await expectNoHorizontalOverflow(page);
  }
});

test("MIDI session keeps its source, queue, and minimized state across routes", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await page.addInitScript(() => {
    localStorage.removeItem("gys-media-position-v1");
    localStorage.setItem("gys-media-minimized", "0");
  });
  await prepareMidiDockFixture(page);

  const media = page.locator(".media-surface");
  await expect(media).toHaveCount(1);
  await expect(media).toHaveClass(/is-kidung-media/);
  const queueBadge = media.locator(".media-queue-badge");
  await expect(queueBadge).toBeHidden();
  await media.locator(".media-advanced-summary").click();
  await expect(queueBadge).toBeVisible();
  await queueBadge.click();
  await expect(page).toHaveURL(/\/kidung\?section=playlist$/);
  const title = await media.locator(".media-context-link strong").textContent();
  expect(title).toBe("Pujilah Allah Yang Maha Esa");

  await page.evaluate(() => {
    window.history.pushState({}, "", "/GYSApp-Tauri/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByRole("heading", { name: /Bacaan & nyanyian/i }),
  ).toBeVisible({
    timeout: 15_000,
  });
  await expect(media).toHaveCount(1);
  await expect(media).toHaveClass(/is-kidung-media/);
  await expect(media.locator(".media-context-link strong")).toHaveText(title!);

  await media.getByRole("button", { name: "Minimalkan pemutar" }).click();
  await expect(media).toHaveClass(/is-minimized/);
  await page.evaluate(() => {
    window.history.pushState({}, "", "/GYSApp-Tauri/bible");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByRole("heading", { name: "Alkitab" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(media).toHaveCount(1);
  await expect(media).toHaveClass(/is-kidung-media/);
  // The minimized MIDI state is an edge tab; the source metadata stays in the hidden dock.
  await expect(media.locator(".media-context-link strong")).toHaveText(title!);
  await expect(media.locator(".media-context-link")).toBeHidden();
  await media
    .getByRole("button", { name: "Perbesar pemutar", exact: true })
    .click();
  await media
    .getByRole("button", { name: /Buka Pujilah Allah Yang Maha Esa/ })
    .click();
  await expect(page).toHaveURL(/\/kidung\/hymn-001$/);
});

test("phone Kidung catalog prioritizes search, compact filtering, and large library rows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCatalog(page);

  const localLinks = page.locator(".kidung-local-nav a");
  for (let index = 0; index < (await localLinks.count()); index += 1) {
    await expectTarget(localLinks.nth(index));
  }

  const search = page.locator(".hymn-catalog-controls .search-field");
  const searchBox = await search.boundingBox();
  expect(searchBox).not.toBeNull();
  expect(searchBox!.width).toBeGreaterThanOrEqual(340);

  const filterTrigger = page.getByRole("combobox", { name: "Koleksi", exact: true });
  await expectTarget(filterTrigger);
  await filterTrigger.click();
  await expect(page.getByRole("listbox", { name: "Koleksi", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  const firstOpen = page.locator(".pujian-title").first();
  const firstNumber = page.locator(".pujian-nomor").first();
  await expect(firstOpen).toBeVisible();
  const openBox = await firstOpen.boundingBox();
  const numberBox = await firstNumber.boundingBox();
  expect(openBox).not.toBeNull();
  expect(numberBox).not.toBeNull();
  expect(openBox!.height).toBeGreaterThanOrEqual(56);
  expect(openBox!.width).toBeGreaterThanOrEqual(230);
  expect(openBox!.x).toBeLessThanOrEqual(numberBox!.x);
  const rowBox = (await page.locator(".pujian-item").first().boundingBox())!;
  expect(openBox!.x + openBox!.width).toBeLessThanOrEqual(rowBox.x + rowBox.width);
  await expect(firstOpen).toContainText("Pujilah Allah Yang Maha Esa");

  await expectTarget(page.locator(".add-to-playlist-btn").first());
  await expectNoHorizontalOverflow(page);
});

test("Kidung number search returns the same song in all supported locales", async ({
  page,
}) => {
  const copies = {
    id: { search: "Cari lagu", placeholder: "Nomor atau judul…" },
    en: { search: "Search hymns", placeholder: "Number or title…" },
    zh: { search: "搜索诗歌", placeholder: "编号或标题…" },
  } as const;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const locale = new URLSearchParams(window.location.search).get(
      "__gys_locale",
    );
    if (locale !== "id" && locale !== "en" && locale !== "zh") return;
    localStorage.setItem("gys-locale", locale);
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({ version: 1, locale, theme: "light" }),
    );
  });

  for (const locale of ["id", "en", "zh"] as const) {
    await page.goto(`/GYSApp-Tauri/kidung?__gys_locale=${locale}`);
    await expect(page.locator(".pujian-list > li").first()).toBeVisible({
      timeout: 20_000,
    });

    const search = page.getByLabel(copies[locale].search, { exact: true });
    await expect(search).toHaveAttribute(
      "placeholder",
      copies[locale].placeholder,
    );
    await search.fill("001");

    const results = page.locator(".pujian-list > li");
    await expect(results).toHaveCount(1);
    await expect(results.first()).toContainText("Pujilah Allah Yang Maha Esa");

    await search.fill("setianya berubah");
    await expect(results).toHaveCount(1);
    await expect(results.first()).toContainText("Pujilah Allah Yang Maha Esa");
  }
});

test("fullscreen lyrics keeps its controls localized and contained", async ({
  page,
}) => {
  const copies = {
    id: {
      open: "Mode lirik layar penuh",
      mode: "Mode lirik",
      previousSong: "Lagu sebelumnya",
      play: "Putar",
      close: "Tutup lirik",
      hideControls: "Sembunyikan kontrol lain",
      instrument: "Pilih alat musik",
      tempo: "Tempo dalam BPM",
      previousVerse: "Bait sebelumnya",
      verse: "Bait 1 dari",
    },
    en: {
      open: "Full-screen lyrics mode",
      mode: "Lyrics mode",
      previousSong: "Previous song",
      play: "Play",
      close: "Close lyrics",
      hideControls: "Hide more controls",
      instrument: "Choose an instrument",
      tempo: "Tempo in BPM",
      previousVerse: "Previous verse",
      verse: "Verse 1 of",
    },
    zh: {
      open: "全屏歌词模式",
      mode: "歌词模式",
      previousSong: "上一首",
      play: "播放",
      close: "关闭歌词",
      hideControls: "隐藏更多控制",
      instrument: "选择乐器",
      tempo: "BPM 速度",
      previousVerse: "上一节",
      verse: "第 1 节，共",
    },
  } as const;

  await page.addInitScript(() => {
    const locale = new URLSearchParams(window.location.search).get(
      "__gys_locale",
    );
    if (locale !== "id" && locale !== "en" && locale !== "zh") return;
    localStorage.setItem("gys-locale", locale);
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({ version: 1, locale, theme: "light" }),
    );
  });

  for (const locale of ["id", "en", "zh"] as const) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      `/GYSApp-Tauri/kidung/hymn-001?mode=lyrics&__gys_locale=${locale}`,
    );
    await expect(
      page.getByRole("heading", { name: /Pujilah Allah/ }),
    ).toBeVisible({ timeout: 20_000 });
    await page.locator(".hymn-more-actions-summary").click();
    await page.getByRole("button", { name: copies[locale].open }).click();

    const panel = page.getByRole("dialog", { name: copies[locale].mode });
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole("button", { name: copies[locale].previousSong }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: copies[locale].play }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: copies[locale].close }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: copies[locale].hideControls }),
    ).toBeVisible();
    await expect(
      panel.getByRole("combobox", { name: copies[locale].instrument }),
    ).toBeVisible();
    await expect(
      panel.getByRole("spinbutton", { name: copies[locale].tempo }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: copies[locale].previousVerse }),
    ).toBeVisible();
    await expect(panel).toContainText(copies[locale].verse);
    await expectNoHorizontalOverflow(page);

    await panel.getByRole("button", { name: copies[locale].close }).click();
    await expect(panel).toHaveCount(0);
  }

  for (const viewport of [
    { width: 320, height: 720 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(
      `/GYSApp-Tauri/kidung/hymn-001?__gys_locale=en&__gys_viewport=${viewport.width}`,
    );
    await expect(
      page.getByRole("heading", { name: /Pujilah Allah/ }),
    ).toBeVisible({ timeout: 20_000 });
    await page.locator(".hymn-more-actions-summary").click();
    await page.getByRole("button", { name: copies.en.open }).click();
    const panel = page.getByRole("dialog", { name: copies.en.mode });
    await expect(panel).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await panel.getByRole("button", { name: copies.en.close }).click();
  }
});

test("fullscreen lyrics controls keep 44px targets at every reader width", async ({
  page,
}) => {
  for (const viewport of [
    { width: 320, height: 720 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await openFirstHymn(page);
    await page.locator(".hymn-more-actions-summary").click();
    await page.getByRole("button", { name: "Mode lirik layar penuh" }).click();

    const panel = page.getByRole("dialog", { name: "Mode lirik" });
    await expect(panel).toBeVisible();
    await expectLyricsGeometry(panel, page);
    await expectNoHorizontalOverflow(page);

    await panel.getByRole("combobox", { name: "Pilih nada dasar" }).click();
    const keyOptions = panel.locator(".lyrics-key-select [role=option]");
    await expect(keyOptions).toHaveCount(12);
    for (let index = 0; index < (await keyOptions.count()); index += 1)
      await expectTarget(keyOptions.nth(index));
    await expectNoHorizontalOverflow(page);

    await panel.getByRole("combobox", { name: "Pilih nada dasar" }).click();
    await panel.getByRole("button", { name: "Tutup lirik" }).click();
  }
});

test("fullscreen lyrics wheel, swipe, and pinch work across reader widths", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.addInitScript(() =>
    localStorage.setItem("gys-lyrics-font-size", "28"),
  );

  for (const viewport of [
    { width: 320, height: 720 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await openFirstHymn(page);
    await page.locator(".hymn-more-actions-summary").click();
    await page.getByRole("button", { name: "Mode lirik layar penuh" }).click();

    const panel = page.getByRole("dialog", { name: "Mode lirik" });
    const content = panel.locator(".lyrics-content");
    const verse = panel.locator(".lyrics-verse-indicator");
    await expect(verse).toHaveText(/^Bait 1 dari/);

    await content.hover();
    await page.mouse.wheel(0, 80);
    await expect(verse).toHaveText(/^Bait 2 dari/);

    await content.dispatchEvent("pointerdown", {
      pointerId: 1,
      pointerType: "touch",
      clientX: 100,
      clientY: 280,
      isPrimary: true,
    });
    await content.dispatchEvent("pointerup", {
      pointerId: 1,
      pointerType: "touch",
      clientX: 100,
      clientY: 200,
      isPrimary: true,
    });
    await expect(verse).toHaveText(/^Bait 3 dari/);

    const fontBefore = Number(
      await page.evaluate(() => localStorage.getItem("gys-lyrics-font-size")),
    );
    await content.dispatchEvent("pointerdown", {
      pointerId: 2,
      pointerType: "touch",
      clientX: 100,
      clientY: 280,
      isPrimary: true,
    });
    await content.dispatchEvent("pointerdown", {
      pointerId: 3,
      pointerType: "touch",
      clientX: 200,
      clientY: 280,
      isPrimary: false,
    });
    await content.dispatchEvent("pointermove", {
      pointerId: 3,
      pointerType: "touch",
      clientX: 250,
      clientY: 280,
      isPrimary: false,
    });
    await content.dispatchEvent("pointerup", {
      pointerId: 2,
      pointerType: "touch",
      clientX: 100,
      clientY: 280,
      isPrimary: true,
    });
    await content.dispatchEvent("pointerup", {
      pointerId: 3,
      pointerType: "touch",
      clientX: 250,
      clientY: 280,
      isPrimary: false,
    });
    await expect
      .poll(() =>
        page.evaluate(() =>
          Number(localStorage.getItem("gys-lyrics-font-size")),
        ),
      )
      .toBeGreaterThan(fontBefore);
    await expectNoHorizontalOverflow(page);

    await panel.getByRole("button", { name: "Tutup lirik" }).click();
  }
});

test("Kidung playlist and reader semantic chrome stays localized", async ({
  page,
}) => {
  await preparePinnedReaderAssets(page);
  const copies = {
    id: {
      playlist: "Playlist",
      import: "Impor",
      export: "Ekspor",
      exportQueue: "Ekspor antrean",
      playlistTools: "Opsi playlist",
      midiPlaylist: "Playlist MIDI",
      playNext: "Putar berikutnya",
      off: "Tidak ada (stop di akhir)",
      showChords: "Tampilkan chord",
      chordLayer: "Lapisan chord",
      displayedKey: "Nada tampil ·",
      lowerCapo: "Turunkan Capo",
      raiseCapo: "Naikkan Capo",
    },
    en: {
      playlist: "Playlist",
      import: "Import",
      export: "Export",
      exportQueue: "Export queue",
      playlistTools: "Playlist tools",
      midiPlaylist: "MIDI playlist",
      playNext: "Play next",
      off: "None (stop at end)",
      showChords: "Show chords",
      chordLayer: "Chord layer",
      displayedKey: "Displayed key ·",
      lowerCapo: "Lower capo",
      raiseCapo: "Raise capo",
    },
    zh: {
      playlist: "播放列表",
      import: "导入",
      export: "导出",
      exportQueue: "导出队列",
      playlistTools: "播放列表选项",
      midiPlaylist: "MIDI 播放列表",
      playNext: "播放下一首",
      off: "无（结束时停止）",
      showChords: "显示和弦",
      chordLayer: "和弦层",
      displayedKey: "当前调性 ·",
      lowerCapo: "降低变调夹",
      raiseCapo: "升高变调夹",
    },
  } as const;

  await page.addInitScript(() => {
    const locale = new URLSearchParams(window.location.search).get(
      "__gys_locale",
    );
    if (locale !== "id" && locale !== "en" && locale !== "zh") return;
    localStorage.setItem("gys-locale", locale);
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({ version: 1, locale, theme: "light" }),
    );
  });

  for (const locale of ["id", "en", "zh"] as const) {
    const copy = copies[locale];
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      `/GYSApp-Tauri/kidung?section=playlist&__gys_locale=${locale}`,
    );
    await expect(
      page.getByRole("heading", { name: copy.playlist, exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    const playlistTools = page.locator(
      ".kidung-tool-heading-actions .kidung-row-menu",
    );
    await expect(
      playlistTools.getByRole("button", { name: copy.import, exact: true }),
    ).toBeHidden();
    await expect(
      playlistTools.getByRole("button", {
        name: copy.exportQueue,
        exact: true,
      }),
    ).toBeHidden();
    await playlistTools
      .locator(`summary[aria-label="${copy.playlistTools}"]`)
      .click();
    await expect(
      playlistTools.getByRole("button", { name: copy.import, exact: true }),
    ).toBeVisible();
    await expect(
      playlistTools.getByRole("button", {
        name: copy.exportQueue,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: copy.midiPlaylist }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: copy.playNext, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(copy.off, { exact: true })).toBeVisible();

    await page.goto(
      `/GYSApp-Tauri/kidung/hymn-001?mode=lyrics&__gys_locale=${locale}`,
    );
    await expect(
      page.getByRole("heading", { name: "Pujilah Allah Yang Maha Esa" }),
    ).toBeVisible({ timeout: 20_000 });
    const showChords = page.getByRole("button", {
      name: copy.showChords,
      exact: true,
    });
    if ((await showChords.count()) > 0) await showChords.click();
    await expect(page.locator(".chord-capability").first()).toHaveAttribute(
      "aria-label",
      copy.chordLayer,
      { timeout: 20_000 },
    );

    await page.locator(".hymn-more-actions-summary").click();
    await page.locator(".hymn-reader-settings-summary").click();
    await page.locator(".hymn-music-settings > summary").click();
    await expect(
      page.getByText(copy.displayedKey, { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: copy.lowerCapo, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: copy.raiseCapo, exact: true }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("small-phone hymn titles stay readable instead of shrinking to fit one line", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openCatalog(page);

  const titles = page.locator(".pujian-title");
  for (let index = 0; index < Math.min(5, await titles.count()); index += 1) {
    const title = titles.nth(index);
    const computed = await title.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        fontSize: Number.parseFloat(style.fontSize),
        lineHeight: Number.parseFloat(style.lineHeight),
        whiteSpace: style.whiteSpace,
      };
    });
    expect(computed.fontSize).toBeGreaterThanOrEqual(13);
    expect(computed.lineHeight).toBeGreaterThanOrEqual(16);
    expect(computed.whiteSpace).not.toBe("nowrap");
    await expectTarget(title, 44);
  }
  await expectNoHorizontalOverflow(page);
});

test("catalog branding and title metrics stay stable through font readiness", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCatalog(page);

  await expect(page.locator(".brand-mark")).toBeVisible();
  await expect(page.locator(".reader-context-title")).toHaveCount(0);

  const before = await page.locator(".pujian-title").evaluateAll((elements) =>
    elements.slice(0, 8).map((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        height: box.height,
      };
    }),
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  });
  const after = await page.locator(".pujian-title").evaluateAll((elements) =>
    elements.slice(0, 8).map((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        height: box.height,
      };
    }),
  );
  expect(after).toEqual(before);

  // Compact collection and search fields share a toolbar without visible labels.
  const search = page.getByRole("searchbox", { name: "Cari lagu" });
  const collection = page.getByRole("combobox", { name: "Koleksi", exact: true });
  await expectTarget(search);
  await expectTarget(collection);
  const searchBox = (await search.boundingBox())!;
  const collectionBox = (await collection.boundingBox())!;
  expect(Math.abs(searchBox.y + searchBox.height / 2 - collectionBox.y - collectionBox.height / 2)).toBeLessThanOrEqual(2);
  await expectNoHorizontalOverflow(page);
});

test("phone hymn reader keeps only contextual primary actions on the surface", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFirstHymn(page);

  const actions = page.locator(
    ".hymn-text-toolbar .detail-actions .hymn-action:visible",
  );
  const actionCount = await actions.count();
  expect(actionCount).toBeGreaterThan(0);
  expect(actionCount).toBeLessThanOrEqual(2);
  for (let index = 0; index < actionCount; index += 1) {
    await expectTarget(actions.nth(index));
  }

  const labels = actions.locator(".hymn-action-label");
  for (let index = 0; index < (await labels.count()); index += 1) {
    await expect(actions.nth(index)).toHaveAccessibleName(/\S/);
    await expect(labels.nth(index)).toBeHidden();
  }

  const more = page.locator(".hymn-more-actions-summary");
  await expectTarget(more);
  await more.click();
  await expect(
    page.getByRole("button", { name: "Mode lirik layar penuh" }),
  ).toBeVisible();

  await expectTarget(page.locator(".hymn-reader-settings-summary"));
  await expectNoHorizontalOverflow(page);
});

test("playlist rows keep low-frequency actions behind one touch-friendly menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPlaylistWithSong(page);

  const row = page.locator(".kidung-playlist-list > li").first();
  const menu = row.locator('summary[aria-label^="Opsi"]');
  await expectTarget(menu);
  await menu.click();
  const panel = row.locator(".kidung-row-menu-panel");
  await expect(panel).toBeVisible();

  const buttons = panel.getByRole("button");
  expect(await buttons.count()).toBeGreaterThanOrEqual(4);
  for (let index = 0; index < (await buttons.count()); index += 1) {
    await expectTarget(buttons.nth(index));
  }

  await expect(panel.getByRole("button", { name: "Naikkan" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Turunkan" })).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Buka kidung" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("Kidung dropdown surfaces stay anchored inside the viewport", async ({
  page,
}) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await openCatalog(page);

    const filter = page.locator(".kidung-header-filter");
    await filter.getByRole("combobox", { name: "Koleksi", exact: true }).click();
    const menu = filter.locator(".control-select-menu");
    await expect(menu).toBeVisible();
    const catalogMenuBox = await menu.boundingBox();
    expect(catalogMenuBox).not.toBeNull();
    expect(catalogMenuBox!.x).toBeGreaterThanOrEqual(-1);
    expect(catalogMenuBox!.x + catalogMenuBox!.width).toBeLessThanOrEqual(
      viewport.width + 1,
    );

    if (viewport.width >= 768) {
      await page.goto("/GYSApp-Tauri/kidung?section=settings");
      await expect(
        page.getByRole("heading", { name: "Pengaturan", exact: true }),
      ).toBeVisible({ timeout: 20_000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      const lowerSelect = page
        .locator(".control-select")
        .filter({ hasText: "Jumlah preload" });
      await lowerSelect
        .getByRole("combobox", { name: "Jumlah preload" })
        .click();
      const lowerMenu = lowerSelect.locator(".control-select-menu");
      await expect(lowerMenu).toBeVisible();
      const lowerBox = await lowerMenu.boundingBox();
      expect(lowerBox).not.toBeNull();
      expect(lowerBox!.y).toBeGreaterThanOrEqual(-1);
      expect(lowerBox!.y + lowerBox!.height).toBeLessThanOrEqual(
        viewport.height + 1,
      );
    }

    await openFirstHymn(page);
    for (const [summary, panel] of [
      [".hymn-more-actions-summary", ".hymn-more-actions-panel"],
      [
        ".hymn-reader-settings-summary",
        ".hymn-reader-settings > .song-controls",
      ],
    ] as const) {
      if (summary === ".hymn-reader-settings-summary")
        await page.locator(".hymn-more-actions-summary").click();
      await page.locator(summary).click();
      const surface = page.locator(panel);
      await expect(surface).toBeVisible();
      const box = await surface.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(-1);
      expect(box!.y).toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
      await page.locator(summary).click();
      if (summary === ".hymn-reader-settings-summary")
        await page.locator(".hymn-more-actions-summary").click();
    }

    await openPlaylistWithSong(page);
    const row = page.locator(".kidung-playlist-list > li").first();
    await row.locator('summary[aria-label^="Opsi"]').click();
    const rowMenu = row.locator(".kidung-row-menu-panel");
    await expect(rowMenu).toBeVisible();
    const rowBox = await rowMenu.boundingBox();
    expect(rowBox).not.toBeNull();
    expect(rowBox!.x).toBeGreaterThanOrEqual(-1);
    expect(rowBox!.y).toBeGreaterThanOrEqual(-1);
    expect(rowBox!.x + rowBox!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(rowBox!.y + rowBox!.height).toBeLessThanOrEqual(viewport.height + 1);
    await expectNoHorizontalOverflow(page);
  }
});

test("PDF reader exposes contextual music controls with direct song navigation", async ({
  page,
}) => {
  test.setTimeout(75_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openFirstHymnPdf(page);

  const chrome = page.locator(".hymn-pdf-viewer-chrome");
  await expect(
    page.locator(".pdf-reader-hymn").getByRole("button", { name: "Pujian sebelumnya", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".pdf-reader-hymn").getByRole("button", { name: "Pujian berikutnya", exact: true }),
  ).toBeVisible();

  const music = chrome.locator('summary[aria-label="Opsi musik"]');
  await expectTarget(music);
  await music.click();
  const panel = chrome.locator(".pdf-music-menu-panel");
  await expect(panel).toBeVisible();
  await expect(page.locator(".hymn-detail-page > .toast")).toHaveCount(0);
  await expect(panel.locator(".pdf-transpose-inline")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("phone hymn reader keeps only frequent actions visible and moves fullscreen lyrics into overflow", async ({
  page,
}) => {
  for (const viewport of [
    { width: 320, height: 720 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await openFirstHymn(page);

    for (const tab of await page.getByRole("tab").all()) {
      await expectTarget(tab);
    }

    const actions = page.locator(
      ".hymn-text-toolbar .detail-actions .hymn-action:visible",
    );
    // MIDI is intentionally hidden until the optional SoundFont is
    // installed. The chord control remains available, so the compact
    // toolbar should expose one or two contextual primary actions depending
    // on the device's installed capabilities.
    const actionCount = await actions.count();
    expect(actionCount).toBeGreaterThanOrEqual(1);
    expect(actionCount).toBeLessThanOrEqual(2);
    for (let index = 0; index < actionCount; index += 1) {
      await expectTarget(actions.nth(index));
    }

    const labels = actions.locator(".hymn-action-label");
    await expect(labels).toHaveCount(actionCount);
    for (let index = 0; index < (await labels.count()); index += 1) {
      await expect(actions.nth(index)).toHaveAccessibleName(/\S/);
      await expect(labels.nth(index)).toBeHidden();
    }

    const toolbarBox = await page.locator(".hymn-text-toolbar").boundingBox();
    expect(toolbarBox).not.toBeNull();
    expect(toolbarBox!.height).toBeLessThanOrEqual(118);

    const fullscreenLyrics = page.getByRole("button", {
      name: "Mode lirik layar penuh",
    });
    await expect(fullscreenLyrics).toBeHidden();

    const overflow = page.locator(".hymn-more-actions-summary");
    await expectTarget(overflow);
    await overflow.click();
    await expect(fullscreenLyrics).toBeVisible();
    await expectTarget(fullscreenLyrics);

    const panel = page.locator(".hymn-more-actions-panel");
    await expect(panel).toBeVisible();
    const panelBox = await panel.boundingBox();
    const fullscreenBox = await fullscreenLyrics.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(fullscreenBox).not.toBeNull();
    expect(fullscreenBox!.x).toBeGreaterThanOrEqual(panelBox!.x);
    expect(fullscreenBox!.x + fullscreenBox!.width).toBeLessThanOrEqual(
      panelBox!.x + panelBox!.width,
    );
    expect(fullscreenBox!.y).toBeGreaterThanOrEqual(panelBox!.y);
    expect(fullscreenBox!.y + fullscreenBox!.height).toBeLessThanOrEqual(
      panelBox!.y + panelBox!.height,
    );

    await expectTarget(page.locator(".hymn-reader-settings-summary"));
    await expectNoHorizontalOverflow(page);
  }
});

test("tablet and desktop hymn actions preserve labels without crowding", async ({
  page,
}) => {
  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await openFirstHymn(page);
    const labels = page.locator(
      ".hymn-text-toolbar .detail-actions .hymn-action-label",
    );
    for (let index = 0; index < (await labels.count()); index += 1) {
      await expect(labels.nth(index)).toBeVisible();
    }
    await expectNoHorizontalOverflow(page);
  }
});

test("wide hymn text reader keeps controls in a compact, non-overlapping toolbar", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1241, height: 958 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    await openFirstHymn(page);

    const toolbar = page.locator(".hymn-text-toolbar");
    const box = await toolbar.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeLessThanOrEqual(88);

    const geometry = await toolbar.evaluate((element) => {
      const controls = [
        ...element.querySelectorAll<HTMLElement>(
          "button:where(:not([hidden])), select:where(:not([hidden]))",
        ),
      ].filter((control) => {
        return control.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
      });
      const boxes = controls.map((control) => {
        const rect = control.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      });
      const rowTops = [
        ...new Set(boxes.map((control) => Math.round(control.y))),
      ];
      const overlaps = boxes.some((left, leftIndex) =>
        boxes.some((right, rightIndex) => {
          if (leftIndex >= rightIndex) return false;
          return (
            Math.min(left.right, right.right) - Math.max(left.x, right.x) > 1 &&
            Math.min(left.bottom, right.bottom) - Math.max(left.y, right.y) > 1
          );
        }),
      );
      return { boxes, rowTops, overlaps };
    });

    expect(geometry.rowTops.length).toBeLessThanOrEqual(2);
    expect(geometry.overlaps).toBe(false);
    for (const control of geometry.boxes) {
      expect(control.width).toBeGreaterThanOrEqual(44 - 0.5);
      expect(control.height).toBeGreaterThanOrEqual(44 - 0.5);
    }
    await expectNoHorizontalOverflow(page);
  }
});

test("hymn lyric sheets stay centered in verse and all-verses modes", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1241, height: 958 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    await openFirstHymn(page);
    await page.evaluate(() =>
      localStorage.setItem("gys-hymn-view-scope", "verse"),
    );
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Pujilah Allah Yang Maha Esa" }),
    ).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(300);

    const verseGeometry = await page.evaluate(() => {
      const surface = document.querySelector<HTMLElement>(
        ".hymn-detail-page.is-text-viewer .hymn-detail-surface",
      )!;
      const sheet = document.querySelector<HTMLElement>(
        ".hymn-detail-page.is-text-viewer .lyrics-sheet",
      )!;
      const surfaceBox = surface.getBoundingClientRect();
      const sheetBox = sheet.getBoundingClientRect();
      return {
        surfaceCenter: (surfaceBox.left + surfaceBox.right) / 2,
        sheetCenter: (sheetBox.left + sheetBox.right) / 2,
      };
    });
    expect(
      Math.abs(verseGeometry.surfaceCenter - verseGeometry.sheetCenter),
    ).toBeLessThanOrEqual(1);

    await page.locator(".hymn-more-actions-summary").click();
    await page.getByRole("button", { name: "Semua", exact: true }).click();
    const allVersesGeometry = await page.evaluate(() => {
      const surface = document.querySelector<HTMLElement>(
        ".hymn-detail-page.is-text-viewer .hymn-detail-surface",
      )!;
      const surfaceBox = surface.getBoundingClientRect();
      return Array.from(
        document.querySelectorAll<HTMLElement>(
          ".hymn-detail-page.is-text-viewer .lyrics-sheet.is-continuous",
        ),
      ).map((sheet) => {
        const sheetBox = sheet.getBoundingClientRect();
        return {
          surfaceCenter: (surfaceBox.left + surfaceBox.right) / 2,
          sheetCenter: (sheetBox.left + sheetBox.right) / 2,
        };
      });
    });
    expect(allVersesGeometry.length).toBeGreaterThan(0);
    for (const geometry of allVersesGeometry) {
      expect(
        Math.abs(geometry.surfaceCenter - geometry.sheetCenter),
      ).toBeLessThanOrEqual(1);
    }
    await expectNoHorizontalOverflow(page);
  }
});

test("all-verses text mode renders canonical chords for every verse", async ({
  page,
}) => {
  await preparePinnedReaderAssets(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openFirstHymn(page);
  await page
    .getByRole("button", { name: "Tampilkan chord", exact: true })
    .click();
  await page.locator(".hymn-more-actions-summary").click();
  await page.getByRole("button", { name: "Semua", exact: true }).click();

  await expect
    .poll(
      () =>
        page
          .locator(".hymn-all-verses-container article")
          .evaluateAll((articles) =>
            articles.map(
              (article) => article.querySelectorAll(".chord-capability").length,
            ),
          ),
      { timeout: 30_000 },
    )
    .toEqual([4, 4, 4]);
  await expect(
    page.locator(".hymn-all-verses-container .chord-visual-row"),
  ).toHaveCount(12);
  await expectNoHorizontalOverflow(page);
});

test("Kidung default chord markers have clear space above their lyric lines", async ({
  page,
}) => {
  await preparePinnedReaderAssets(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openFirstHymn(page);
  await page
    .getByRole("button", { name: "Tampilkan chord", exact: true })
    .click();
  await expect(page.locator(".chord-capability").first()).toBeVisible({
    timeout: 20_000,
  });

  // Measure each visual row: larger system fonts may wrap one lyric line.
  const gaps = () =>
    page.locator(".chord-rich-line").evaluateAll((lines) =>
      lines.flatMap((line) => {
        const lyrics = line.querySelector(".chord-text-layer")!;
        const chars = [
          ...lyrics.querySelectorAll("[data-chord-char-index]"),
        ].filter((char) => char.textContent?.trim());
        return [...line.querySelectorAll<HTMLElement>(".chord-visual-row")].map(
          (row) => {
            const anchorTop =
              lyrics.getBoundingClientRect().top + parseFloat(row.style.top);
            const matching = chars.filter(
              (char) =>
                Math.abs(char.getBoundingClientRect().top - anchorTop) < 2,
            );
            const lyricTop = Math.min(
              ...matching.map((char) => {
                const range = document.createRange();
                range.selectNodeContents(char);
                return range.getBoundingClientRect().top;
              }),
            );
            const markers = [...row.querySelectorAll(".chord-visual-marker")];
            if (!matching.length || !markers.length) return -Infinity;
            return (
              lyricTop -
              Math.max(
                ...markers.map(
                  (marker) => marker.getBoundingClientRect().bottom,
                ),
              )
            );
          },
        );
      }),
    );
  await expect
    .poll(async () => {
      const values = await gaps();
      return values.length ? Math.min(...values) : -Infinity;
    })
    .toBeGreaterThanOrEqual(4);
});

test("all-verses mode uses one scroll surface for every complete stanza", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("gys-hymn-view-scope", "all");
  });
  await page.goto("/GYSApp-Tauri/kidung/hymn-004");
  await expect(
    page.getByRole("heading", { name: "Pujilah Bapa Yang di Surga" }),
  ).toBeVisible({ timeout: 20_000 });

  const geometry = await page.evaluate(() => {
    const container = document.querySelector<HTMLElement>(
      ".hymn-all-verses-container",
    );
    const articles = [
      ...document.querySelectorAll<HTMLElement>(
        ".hymn-all-verses-container > article",
      ),
    ];
    return {
      container: container
        ? {
            clientHeight: container.clientHeight,
            scrollHeight: container.scrollHeight,
            overflowY: getComputedStyle(container).overflowY,
          }
        : null,
      articles: articles.map((article) => ({
        clientHeight: article.clientHeight,
        scrollHeight: article.scrollHeight,
        overflowY: getComputedStyle(article).overflowY,
      })),
    };
  });

  expect(geometry.container?.overflowY).toBe("auto");
  expect(geometry.container?.scrollHeight).toBeGreaterThan(
    geometry.container?.clientHeight ?? 0,
  );
  expect(geometry.articles.length).toBeGreaterThan(1);
  for (const article of geometry.articles) {
    expect(article.overflowY).toBe("visible");
    expect(article.scrollHeight).toBeLessThanOrEqual(article.clientHeight + 1);
  }
  await expectNoHorizontalOverflow(page);
});

const visualCases = [
  ["catalog-small-phone-320x720", 320, 720, "catalog", "light"],
  ["catalog-phone-390x844", 390, 844, "catalog", "light"],
  ["catalog-large-phone-430x932", 430, 932, "catalog", "light"],
  ["catalog-tablet-768x1024", 768, 1024, "catalog", "light"],
  ["catalog-landscape-1024x768", 1024, 768, "catalog", "light"],
  ["catalog-desktop-1440x900", 1440, 900, "catalog", "light"],
  ["playlist-phone-390x844", 390, 844, "playlist", "light"],
  ["playlist-tablet-768x1024", 768, 1024, "playlist", "light"],
  ["reader-text-small-phone-320x720", 320, 720, "reader", "light"],
  ["reader-text-phone-390x844", 390, 844, "reader", "light"],
  ["reader-text-tablet-768x1024", 768, 1024, "reader", "light"],
  ["reader-text-desktop-1440x900", 1440, 900, "reader", "light"],
  ["reader-text-wide-1920x1080", 1920, 1080, "reader", "light"],
  ["reader-pdf-phone-390x844", 390, 844, "pdf", "light"],
  ["reader-pdf-tablet-768x1024", 768, 1024, "pdf", "light"],
  ["reader-pdf-desktop-1440x900", 1440, 900, "pdf", "light"],
  ["reader-dark-phone-390x844", 390, 844, "reader", "dark"],
  ["reader-dark-tablet-768x1024", 768, 1024, "reader", "dark"],
  ["playlist-menu-phone-390x844", 390, 844, "playlist-menu", "light"],
  ["reader-more-phone-390x844", 390, 844, "reader-more", "light"],
  ["reader-settings-phone-390x844", 390, 844, "reader-settings", "light"],
  ["pdf-music-phone-390x844", 390, 844, "pdf-music", "light"],
] as const;

for (const [name, width, height, surface, theme] of visualCases) {
  test(`Kidung visual ${name}`, async ({ page }) => {
    test.setTimeout(
      surface === "pdf" || surface === "pdf-music" ? 75_000 : 45_000,
    );
    await page.setViewportSize({ width, height });

    if (surface === "catalog") await openCatalog(page);
    if (surface === "playlist") await openPlaylistWithSong(page);
    if (surface === "reader") await openFirstHymn(page);
    if (surface === "pdf" || surface === "pdf-music")
      await preparePinnedReaderAssets(page);
    if (surface === "pdf") await openFirstHymnPdf(page);
    if (surface === "playlist-menu") {
      await openPlaylistWithSong(page);
      const row = page.locator(".kidung-playlist-list > li").first();
      await row.locator('summary[aria-label^="Opsi"]').click();
      await expect(row.locator(".kidung-row-menu-panel")).toBeVisible();
    }
    if (surface === "reader-more") {
      await openFirstHymn(page);
      await page.locator(".hymn-more-actions-summary").click();
      await expect(page.locator(".hymn-more-actions-panel")).toBeVisible();
    }
    if (surface === "reader-settings") {
      await openFirstHymn(page);
      await page.locator(".hymn-more-actions-summary").click();
      await page.locator(".hymn-reader-settings-summary").click();
      await expect(
        page.locator(".hymn-reader-settings > .song-controls"),
      ).toBeVisible();
    }
    if (surface === "pdf-music") {
      await openFirstHymnPdf(page);
      await page.locator('summary[aria-label="Opsi musik"]').click();
      await expect(page.locator(".pdf-music-menu-panel")).toBeVisible();
    }

    await page.evaluate((nextTheme) => {
      document.documentElement.dataset.theme = nextTheme;
    }, theme);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: `test-results/ui-preview/kidung-density/${name}.png`,
      fullPage: false,
      animations: "disabled",
    });
  });
}
