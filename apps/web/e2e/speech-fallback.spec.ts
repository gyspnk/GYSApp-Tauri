import { expect, test } from "@playwright/test";

type SpokenWindow = Window & { __spoken?: string[] };

// The Edge relay is the preferred voice, not a requirement. This contract pins
// what the reader sees when the configured gateway refuses with 503: the
// chapter still plays through the device voice and the player names that
// fallback instead of reporting an error.
test("a refusing Edge relay speaks through the device voice without an error", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());

  // The browser bundle has no remote BFF base, so the gateway endpoint comes
  // from the same-origin override the speech settings already support.
  let edgeAttempts = 0;
  await page.route("**/__e2e/tts/edge", (route) => {
    if (route.request().method() === "POST") edgeAttempts += 1;
    return route.fulfill({
      status: 503,
      json: {
        error: {
          code: "UPSTREAM_UNAVAILABLE",
          message: "Edge compatibility speech is not configured",
        },
      },
    });
  });

  await page.addInitScript(() => {
    localStorage.setItem("gys-locale", "id");
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({ version: 1, locale: "id", theme: "light" }),
    );
    localStorage.setItem("gys-media-minimized", "0");
    localStorage.setItem(
      "gys-custom-edge-endpoint-v1",
      "/GYSApp-Tauri/__e2e/tts/edge",
    );

    const spoken: string[] = [];
    (window as SpokenWindow).__spoken = spoken;
    const voice = {
      voiceURI: "gys-e2e-system",
      name: "GYS E2E System Voice",
      lang: "id-ID",
      localService: false,
      default: true,
    };
    // Device voices "play" by recording the utterance and ending it, so the
    // whole chapter stays deterministic and network-free.
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: () => [voice],
        speak: (utterance: { text: string; onend?: () => void }) => {
          spoken.push(utterance.text);
          window.setTimeout(() => utterance.onend?.(), 300);
        },
        cancel: () => undefined,
        pause: () => undefined,
        resume: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });
    class TestUtterance {
      public lang = "";
      public voice: unknown = null;
      public rate = 1;
      public pitch = 1;
      public volume = 1;
      public onend?: () => void;
      public onerror?: () => void;
      public constructor(public readonly text: string) {}
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: TestUtterance,
    });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.getByRole("heading", { name: /Kejadian 1/ })).toBeVisible({
    timeout: 15_000,
  });
  const read = page.getByRole("button", { name: "Bacakan", exact: true });
  await expect(read).toBeEnabled({ timeout: 15_000 });
  await read.click();

  const media = page.locator("#persistent-media-player");
  await expect(media).toBeVisible({ timeout: 15_000 });
  // "TTS sistem" is the player's own name for the device voice; the visible
  // verse progress proves the player is not in its error state.
  await expect(media.locator(".media-meta small")).toContainText("TTS sistem");
  await expect(media.locator(".media-meta > span")).toHaveText(
    /Ayat \d+ dari 31/,
  );
  await expect(
    page.getByText("Gagal memutar audio", { exact: true }),
  ).toHaveCount(0);
  await expect(media).not.toContainText("503");

  await expect
    .poll(() => page.evaluate(() => (window as SpokenWindow).__spoken ?? []))
    .toContain("1. Pada mulanya Allah menciptakan langit dan bumi.");
  expect(edgeAttempts).toBeGreaterThan(0);
});
