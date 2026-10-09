import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import {
  preparePinnedMidiAsset,
  preparePinnedReaderAssets,
} from "./pinned-reader-fixtures.js";

for (const width of [390, 768, 1440]) {
  test(`Kidung navigation retains its leading anchor and row height between sections at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/kidung");
    const nav = page.locator(".kidung-local-nav");
    await expect(page.locator(".pujian-list > li").first()).toBeVisible();
    const bounds = await nav.locator("a").evaluateAll((links) =>
      links.map((link) => {
        const { y, height } = link.getBoundingClientRect();
        return { x: links[0]!.getBoundingClientRect().x, y, height };
      }),
    );
    for (const section of ["Playlist", "Pengaturan", "Kidung"]) {
      await expect(page.locator("html")).not.toHaveClass(
        /is-reader-transition/,
      );
      await nav.getByRole("link", { name: section, exact: true }).click();
      await expect(
        nav.getByRole("link", { name: section, exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await expect(page.locator("html")).not.toHaveClass(
        /is-reader-transition/,
      );
      await expect
        .poll(() =>
          nav.locator("a").evaluateAll((links) =>
            links.map((link) => {
              const { y, height } = link.getBoundingClientRect();
              return { x: links[0]!.getBoundingClientRect().x, y, height };
            }),
          ),
        )
        .toEqual(bounds);
    }
    const controls = page.locator(".kidung-controls-field");
    const field = (await controls.boundingBox())!;
    const mode = (await controls
      .locator(".kidung-mode-control")
      .boundingBox())!;
    const category = (await controls
      .locator(".control-select-trigger")
      .boundingBox())!;
    expect(category.width).toBeGreaterThanOrEqual(75);
    expect(mode.x + mode.width).toBeLessThanOrEqual(field.x + field.width);
  });

  test(`MIDI exposes full controls and docks across routes at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    await preparePinnedMidiAsset(page);
    await preparePinnedReaderAssets(page);
    await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
    await page.locator(".hymn-midi-toggle").click();
    const player = page.locator(".media-surface.is-kidung-media");
    await expect(player).toBeVisible();
    await expect(player).not.toHaveClass(/is-minimized/);
    await expect(player.locator(".media-next-control")).toBeEnabled();
    await expect(player.locator(".media-previous-control")).toBeDisabled();
    await expect(
      player.getByRole("slider", { name: "Posisi MIDI" }),
    ).toBeVisible();
    await player.locator(".media-advanced-summary").click();
    const panel = player.locator(".media-advanced-panel");
    await expect(panel.locator(".media-stop-control")).toBeVisible();
    await expect(panel.locator(".media-mute-control")).toBeVisible();
    await expect(
      player.locator(".media-instrument-control").getByRole("combobox"),
    ).toBeVisible();
    await expect(
      player.locator(".media-key-control").getByRole("combobox"),
    ).toHaveText("D");
    await expect(player.locator(".media-transpose strong")).toHaveText("-1");
    const beforeTranspose = Number(
      await player.locator(".media-transpose strong").innerText(),
    );
    await player
      .locator(".media-transpose")
      .getByRole("button", { name: "Naikkan nada" })
      .click();
    await expect(player.locator(".media-transpose strong")).toHaveText(
      beforeTranspose + 1 > 0
        ? `+${beforeTranspose + 1}`
        : String(beforeTranspose + 1),
    );
    await player
      .locator(".media-transpose")
      .getByRole("button", { name: "Naikkan nada" })
      .click();
    await player
      .getByRole("button", { name: "Reset transpose", exact: true })
      .click();
    await expect(player.locator(".media-transpose strong")).toHaveText("0");
    await expect(
      player
        .getByRole("button", { name: "Reset transpose", exact: true })
        .locator("svg"),
    ).toBeVisible();
    for (const button of await panel.locator("button").all()) {
      if (!(await button.isVisible())) continue;
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(43.9);
      expect(box.height).toBeGreaterThanOrEqual(43.9);
    }
    expect(
      (
        await new AxeBuilder({ page })
          .include(".media-surface")
          .withTags(["wcag2a", "wcag2aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await player
      .getByRole("button", { name: "Minimalkan pemutar", exact: true })
      .click();
    await expect(player).toHaveClass(/is-minimized/);
    const grip = player.locator(".media-drag-handle");
    await grip.focus();
    await grip.press("ArrowRight");
    await expect(player).toHaveAttribute("data-edge", "right");
    await page.locator(".hymn-text-title a").click();
    await expect(page).toHaveURL(/\/kidung$/);
    await page
      .locator(".primary-nav")
      .getByRole("link", { name: "Beranda", exact: true })
      .click();
    await expect(page).toHaveURL(/GYSApp-Tauri\/?$/);
    await expect
      .poll(() => player.evaluate((el) => el.getAnimations().length))
      .toBe(0);
    const before = (await player.boundingBox())!;
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    const after = (await player.boundingBox())!;
    expect(Math.abs(before.y - after.y)).toBeLessThan(1);
    await player
      .getByRole("button", { name: "Perbesar pemutar", exact: true })
      .click();
    await expect(player).not.toHaveClass(/is-minimized/);
    await player
      .getByRole("button", { name: "Tutup MIDI", exact: true })
      .click();
    await expect(player).toHaveCount(0);
  });

  test(`PDF chord placement, key detection and mouse/touch pan at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    await preparePinnedReaderAssets(page);
    await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=pdf");
    const reader = page.locator(".pdf-reader");
    await expect(
      reader.locator('canvas[data-pdf-rendered="true"]').first(),
    ).toBeVisible();
    await page.locator(".pdf-music-summary").click();
    await page
      .getByRole("button", { name: "Tampilkan chord", exact: true })
      .click();
    const layer = reader.locator(".pdf-chord-layer").first();
    await expect(layer.locator(".pdf-chord-marker").first()).toBeVisible();
    // The first verified score is in E-flat. Natural-chord defaults display D;
    // inferring from its first chord incorrectly reports C before MIDI opens.
    await expect(page.locator(".pdf-key-btn")).toHaveText("D");
    await expect(page.locator(".pdf-transpose-btns strong")).toHaveText("-1");
    const chord = layer.locator(".pdf-chord-marker").first();
    await expect(chord).toHaveText("D");
    const originalText = await chord.innerText();
    await page
      .locator(".pdf-transpose-btns")
      .getByRole("button", { name: "Naikkan transpose" })
      .click();
    await expect(chord).not.toHaveText(originalText);
    await page
      .getByRole("button", { name: "Sembunyikan chord", exact: true })
      .click();
    await expect(layer).toHaveAttribute("data-chords-visible", "false");
    await expect
      .poll(() => layer.evaluate((el) => Number(getComputedStyle(el).opacity)))
      .toBe(0);
    // Markers remain mounted so hiding actually animates instead of disappearing.
    await expect(layer.locator(".pdf-chord-marker").first()).toHaveCount(1);
    await page
      .getByRole("button", { name: "Tampilkan chord", exact: true })
      .click();
    await expect
      .poll(() => layer.evaluate((el) => Number(getComputedStyle(el).opacity)))
      .toBe(1);
    await page.locator(".pdf-music-summary").click();
    const stage = reader.locator(".pdf-stage");
    await stage.evaluate((el) => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: -650,
          ctrlKey: true,
          clientX: r.x + r.width / 2,
          clientY: r.y + r.height / 2,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await expect(stage).toHaveAttribute("data-pdf-pannable", "true");
    await page.waitForTimeout(350);
    const box = (await stage.boundingBox())!;
    const position = () =>
      stage.evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }));
    const start = await position();
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3, {
      steps: 6,
    });
    await page.mouse.up();
    const dragged = await position();
    expect(dragged.x).toBeGreaterThan(start.x + 20);
    expect(dragged.y).toBeGreaterThan(start.y + 20);
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 },
      ],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: box.x + box.width * 0.7, y: box.y + box.height * 0.7 },
      ],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    const touched = await position();
    expect(touched.x).toBeLessThan(dragged.x - 20);
    expect(touched.y).toBeLessThan(dragged.y - 20);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });

  test(`Sauh thumbnail keeps its frame through decoding at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    const snapshot = JSON.parse(
      await readFile(
        new URL("../public/offline/sauh.json", import.meta.url),
        "utf8",
      ),
    );
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(new Date())
      .replaceAll("-", "")
      .slice(2);
    const post = {
      ...snapshot.items[0],
      id: `sbj${day}`,
      url: `https://tjc.org/id/gerakan-baca-alkitab/sbj${day}/`,
      updatedAt: new Date().toISOString(),
      imageUrl:
        "https://tjc.org/id/wp-content/uploads/ui-thumbnail-300x200.jpg",
    };
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.route("**/offline/sauh.json", (route) =>
      route.fulfill({ json: { items: [post] } }),
    );
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const imageRequests: string[] = [];
    await page.route("**/ui-thumbnail*", async (route) => {
      imageRequests.push(route.request().url());
      await pending;
      await route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1600"><rect width="2400" height="1600" fill="#2a799b"/></svg>',
      });
    });
    try {
      await page.goto("/GYSApp-Tauri/");
      const media = page.locator(".sauh-card-media");
      await expect(media).toBeVisible();
      await expect(page.locator(".sauh-image-wrap")).toHaveAttribute(
        "data-image-state",
        "loading",
      );
      // Compare decode geometry after the intentional entrance and font load;
      // a moving parent is unrelated to the image's reserved dimensions.
      await page.evaluate(() => document.fonts.ready);
      await page.locator(".home-page").evaluate(async (element) => {
        await Promise.all(
          element
            .getAnimations({ subtree: true })
            .filter(
              (animation) =>
                animation.effect?.getTiming().iterations !== Infinity,
            )
            .map((animation) => animation.finished.catch(() => undefined)),
        );
      });
      const before = (await media.boundingBox())!;
      release();
      await expect(page.locator(".sauh-image-wrap")).toHaveAttribute(
        "data-image-state",
        "loaded",
      );
      const after = (await media.boundingBox())!;
      expect(Math.abs(before.width - after.width)).toBeLessThan(1);
      expect(Math.abs(before.height - after.height)).toBeLessThan(1);
      expect(Math.abs(before.y - after.y)).toBeLessThan(1);
      expect(after.height).toBeLessThanOrEqual(340);
      expect(imageRequests).toHaveLength(1);
      expect(imageRequests[0]).toContain("-300x200.jpg");
      if (width >= 600) {
        await page.evaluate(() =>
          window.scrollTo(0, document.documentElement.scrollHeight),
        );
        const rail = (await page.locator(".navigation-shell").boundingBox())!;
        expect(rail.y).toBeGreaterThanOrEqual(0);
        expect(rail.y).toBeLessThan(80);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.goto("/GYSApp-Tauri/sauh");
      const body = page.locator(".online-article-body");
      await expect(body).toBeVisible();
      const articleImage = page.locator(
        ".online-article-card > .img-skeleton-wrapper",
      );
      await expect(articleImage).toHaveAttribute("data-image-state", "loaded");
      const imageBox = (await articleImage.boundingBox())!;
      const bodyBox = (await body.boundingBox())!;
      const cardBox = (await page
        .locator(".online-article-card")
        .boundingBox())!;
      if (width >= 1000) {
        expect(bodyBox.x).toBeGreaterThan(imageBox.x + imageBox.width);
        expect(bodyBox.width).toBeGreaterThan(cardBox.width * 0.55);
        expect(bodyBox.y).toBeLessThan(500);
      } else {
        expect(bodyBox.y).toBeGreaterThanOrEqual(imageBox.y + imageBox.height);
      }
      expect(bodyBox.x + bodyBox.width).toBeLessThanOrEqual(width);
    } finally {
      release();
    }
  });
}
