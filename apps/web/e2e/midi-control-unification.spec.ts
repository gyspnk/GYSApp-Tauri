import { expect, test, type Page } from "@playwright/test";
import {
  preparePinnedReaderAssets,
  preparePinnedMidiAsset,
} from "./pinned-reader-fixtures.js";

const CANONICAL_LABELS = [
  "Instrumen MIDI",
  "Pilih nada dasar",
  "Turunkan nada",
  "Naikkan nada",
  "Reset transpose",
  "Kurangi tempo",
  "Tambah tempo",
  "Tempo MIDI",
];

type Control = {
  label: string;
  tag: string;
  className: string;
  height: number;
  radius: number;
  background: string;
};

async function measureControls(
  page: Page,
  surface: string,
): Promise<Control[]> {
  return page.locator(surface).evaluate((root) => {
    const selectors = [
      ".control-select-trigger",
      ".media-transpose button",
      ".midi-tempo-stepper > button",
      ".midi-tempo-stepper input",
      ".media-mute-button",
      ".media-mute-control",
      ".capo-control button",
    ].join(", ");
    return Array.from(root.querySelectorAll<HTMLElement>(selectors))
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 2 && box.height > 2;
      })
      .map((element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          label: (element.getAttribute("aria-label") ?? "").trim(),
          className: element.className.toString(),
          height: Math.round(box.height),
          radius: Number.parseFloat(style.borderTopLeftRadius) || 0,
          background: style.backgroundColor,
        };
      });
  });
}

function expectDockGeometry(
  controls: Control[],
  expectedHeight: number,
  surface: string,
) {
  expect(controls.length, `${surface} exposes MIDI controls`).toBeGreaterThan(
    1,
  );
  for (const control of controls) {
    if (control.tag === "input") continue;
    // The transpose stepper shares one rounded container, so its inner buttons
    // are square by design; the container carries the radius.
    if (/transpose|nada/i.test(control.label)) continue;
    expect(control.radius, `${surface} ${control.label} radius`).toBe(12);
    // The dock's fields follow the same pointer-based geometry as the reader
    // sheet and the fullscreen lyrics: 32px on a precise pointer, 44px coarse.
    // Only the transport keeps the wider 44-56px clamp.
    expect(control.height, `${surface} ${control.label} height`).toBe(
      expectedHeight,
    );
  }
}

function expectOneGeometry(
  controls: Control[],
  expectedHeight: number,
  surface: string,
) {
  expect(controls.length, `${surface} exposes MIDI controls`).toBeGreaterThan(
    3,
  );
  for (const control of controls) {
    if (control.tag === "input") continue;
    expect(
      control.height,
      `${surface} ${control.label || control.className} height`,
    ).toBe(expectedHeight);
    if (control.className.includes("media-transpose-reset")) continue;
    if (control.className.includes("media-transpose button")) continue;
    if (control.className.includes("media-mute-button")) {
      expect(control.radius, `${surface} mute radius`).toBe(12);
      continue;
    }
    // Square buttons live inside a rounded container; the container owns the
    // radius. Everything that is a standalone field uses the control radius.
    if (control.label === "Turunkan nada" || control.label === "Naikkan nada") {
      expect(control.radius, `${surface} transpose inner radius`).toBe(0);
      continue;
    }
    expect(control.radius, `${surface} ${control.label} radius`).toBe(12);
  }
}

async function openReaderSheet(page: Page, touch: boolean) {
  const tap = async (locator: ReturnType<Page["locator"]>) => {
    if (touch) await locator.tap();
    else await locator.click();
  };
  await tap(page.locator(".hymn-more-actions-summary"));
  await tap(page.locator(".hymn-reader-settings-summary"));
  const music = page
    .locator(".reader-settings-group")
    .filter({ hasText: "Musik & chord" })
    .locator("summary")
    .first();
  await tap(music);
  await expect(page.locator(".hymn-music-settings")).toBeVisible();
}

for (const { width, touch } of [
  { width: 320, touch: true },
  { width: 390, touch: true },
  { width: 768, touch: true },
  { width: 1440, touch: false },
]) {
  test.describe(`${width}px ${touch ? "touch" : "mouse"}`, () => {
    test.use({ hasTouch: touch });
    test("dock and reader sheet share one MIDI control geometry", async ({
      page,
    }) => {
      test.setTimeout(150_000);
      await page.setViewportSize({ width, height: 844 });
      await page.route(/^https:\/\//, (route) => route.abort());
      await preparePinnedReaderAssets(page);
      await preparePinnedMidiAsset(page);
      await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");

      const tap = async (locator: ReturnType<Page["locator"]>) => {
        if (touch) await locator.tap();
        else await locator.click();
      };

      await tap(page.locator(".hymn-midi-toggle"));
      const player = page.locator(".media-surface.is-kidung-media");
      await expect(player).toBeVisible({ timeout: 30_000 });

      // The dock is the largest surface by design (44-56 px clamp), but every
      // control inside it must still share one radius and one height band.
      await tap(player.locator(".media-advanced-summary"));
      await expect(player.locator(".media-advanced-panel")).toBeVisible();
      const dockPanel = await measureControls(page, ".media-advanced-panel");
      expectDockGeometry(dockPanel, touch ? 44 : 32, `${width} dock panel`);

      await tap(player.locator(".media-tempo-toggle"));
      const tempoPopover = page.locator(".media-tempo-popover");
      await expect(tempoPopover).toBeVisible();
      const dockTempo = await measureControls(page, ".media-tempo-popover");
      expectDockGeometry(dockTempo, touch ? 44 : 32, `${width} dock tempo`);

      const dockLabels = [
        ...dockPanel.map((control) => control.label),
        ...dockTempo.map((control) => control.label),
        ...(await page
          .locator(".media-surface.is-kidung-media .media-mute-control")
          .evaluateAll((els) =>
            els.map((el) => (el.getAttribute("aria-label") ?? "").trim()),
          )),
      ];
      for (const label of CANONICAL_LABELS) {
        expect(dockLabels, `${width} dock has "${label}"`).toContain(label);
      }

      // Close the dock before opening the reader sheet: its surface overlaps
      // the toolbar and the tempo popover swallows pointer events.
      await page.keyboard.press("Escape");
      await tap(player.locator(".media-close-button"));
      await expect(player).toBeHidden({ timeout: 15_000 });
      await openReaderSheet(page, touch);
      const reader = await measureControls(page, ".hymn-music-settings");
      expectOneGeometry(reader, touch ? 44 : 32, `${width} reader`);

      const readerLabels = reader.map((control) => control.label);
      for (const label of CANONICAL_LABELS) {
        expect(readerLabels, `${width} reader has "${label}"`).toContain(label);
      }
      expect(
        reader.filter((control) => control.label === "Instrumen MIDI")[0]
          ?.background,
        `${width} instrument fill`,
      ).toBe(
        dockPanel.filter((control) => control.label === "Instrumen MIDI")[0]
          ?.background,
      );
    });
  });
}

test.describe("fullscreen lyrics", () => {
  test.use({ hasTouch: true });
  test("fullscreen lyrics reuse the dock control geometry", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route(/^https:\/\//, (route) => route.abort());
    await preparePinnedReaderAssets(page);
    await preparePinnedMidiAsset(page);
    await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
    await page.locator(".hymn-more-actions-summary").tap();
    await page.getByRole("button", { name: "Mode lirik layar penuh" }).tap();
    const panel = page.locator(".lyrics-panel");
    await expect(panel).toBeVisible({ timeout: 20_000 });
    if ((await panel.locator(".lyrics-extra").count()) === 0) {
      await panel
        .locator(
          '.lyrics-header-actions .lyrics-ctrl-btn[aria-expanded="false"]',
        )
        .last()
        .tap();
    }
    await expect(panel.locator(".lyrics-extra")).toBeVisible();
    const controls = await measureControls(page, ".lyrics-extra");
    expectOneGeometry(controls, 44, "fullscreen lyrics");
    const labels = controls.map((control) => control.label);
    for (const label of CANONICAL_LABELS) {
      expect(labels, `fullscreen has "${label}"`).toContain(label);
    }
  });
});

async function measureTransport(page: Page, root: string) {
  return page.locator(root).evaluate((surface) => {
    const pick = (selector: string) =>
      Array.from(surface.querySelectorAll<HTMLElement>(selector))
        .filter((element) => {
          const box = element.getBoundingClientRect();
          return box.width > 2 && box.height > 2;
        })
        .map((element) => {
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            label: (element.getAttribute("aria-label") ?? "").trim(),
            width: Math.round(box.width),
            height: Math.round(box.height),
            radius: Number.parseFloat(style.borderTopLeftRadius) || 0,
            background: style.backgroundColor,
            disabled:
              element.getAttribute("aria-disabled") === "true" ||
              (element as HTMLButtonElement).disabled === true,
          };
        });
    return {
      secondary: pick(
        ".media-previous-control, .media-next-control, .lyrics-transport .lyrics-hdr-btn:not(.lyrics-play-toggle)",
      ),
      play: pick(".media-primary-control, .lyrics-play-toggle")[0],
    };
  });
}

for (const { width, touch } of [
  { width: 390, touch: true },
  { width: 1440, touch: false },
]) {
  test.describe(`transport ${width}px`, () => {
    test.use({ hasTouch: touch });
    test("dock and fullscreen share one transport geometry", async ({
      page,
    }) => {
      test.setTimeout(150_000);
      await page.setViewportSize({ width, height: 844 });
      await page.route(/^https:\/\//, (route) => route.abort());
      await preparePinnedReaderAssets(page);
      await preparePinnedMidiAsset(page);
      await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
      const tap = async (locator: ReturnType<Page["locator"]>) => {
        if (touch) await locator.tap();
        else await locator.click();
      };
      await tap(page.locator(".hymn-midi-toggle"));
      const player = page.locator(".media-surface.is-kidung-media");
      await expect(player).toBeVisible({ timeout: 30_000 });
      const dock = await measureTransport(
        page,
        ".media-surface.is-kidung-media",
      );
      await tap(player.locator(".media-close-button"));
      await expect(player).toBeHidden({ timeout: 15_000 });
      await tap(page.locator(".hymn-more-actions-summary"));
      await tap(page.getByRole("button", { name: "Mode lirik layar penuh" }));
      const panel = page.locator(".lyrics-panel");
      await expect(panel).toBeVisible({ timeout: 20_000 });
      const full = await measureTransport(page, ".lyrics-panel");

      const expected = touch ? 44 : 32;
      for (const source of [dock, full]) {
        expect(source.secondary.length).toBe(2);
        for (const control of source.secondary) {
          expect(control.height, `${control.label} height`).toBe(expected);
          expect(control.width, `${control.label} width`).toBe(expected);
          expect(control.radius, `${control.label} radius`).toBe(12);
        }
        expect(source.play, "play button exists").toBeTruthy();
        expect(source.play!.width, "play width").toBe(source.play!.height);
        expect(
          source.play!.radius,
          "play radius covers half the button (circular)",
        ).toBeGreaterThanOrEqual(source.play!.width / 2);
      }
      expect(full.play!.height, "fullscreen play height").toBe(
        expected === 32 ? 32 : 44,
      );
      expect(dock.play!.background, "dock play colour").toBe(
        "rgb(0, 113, 156)",
      );
      if (!full.play!.disabled) {
        expect(full.play!.background, "fullscreen play colour").toBe(
          dock.play!.background,
        );
      } else {
        // Without a MIDI track the primary action shows its disabled token;
        // it must still be a themed surface colour, never the UA grey.
        expect(full.play!.background).not.toBe(dock.play!.background);
        expect(full.play!.background).toContain("rgb(");
      }
    });
  });
}
