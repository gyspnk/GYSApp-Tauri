import { expect, test } from "@playwright/test";

test("every instrument control migrates file-program defaults to the selected SoundFont preset", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "gys-midi-preferences-v1",
      JSON.stringify({ instrument: -1 }),
    ),
  );
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  await expect(page.locator(".lyrics-sheet")).toBeVisible();
  const options = () =>
    page
      .locator('option[value="-1"], [role="option"][data-value="-1"]')
      .count();
  expect(await options()).toBe(0);
  await page.locator(".hymn-more-actions > summary").click();
  await page.locator(".hymn-fullscreen-action").click();
  await expect(page.locator(".lyrics-panel")).toBeVisible();
  expect(await options()).toBe(0);
  const instrument = page
    .locator(".lyrics-panel select")
    .filter({ has: page.locator('option[value="127"]') });
  await expect(instrument).toHaveValue("0");
  await instrument.selectOption("40");
  await expect(instrument).toHaveValue("40");
  const stored = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("gys-midi-preferences-v1")!).instrument,
  );
  expect(stored).toBe(40);
});

test("real FluidSynth PCM ignores MIDI programs/banks and uses the selected active bank preset", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  const result = await page.evaluate(async () => {
    const worker = new Worker(
      new URL(
        "vendor/midi-render-worker.js",
        new URL("/GYSApp-Tauri/", location.origin).href,
      ),
    );
    let nextId = 0;
    const request = (payload: Record<string, unknown>) =>
      new Promise<any>((resolve, reject) => {
        const id = ++nextId;
        const onMessage = (event: MessageEvent) => {
          if (event.data.id !== id) return;
          if (event.data.type === "renderProgress") return;
          worker.removeEventListener("message", onMessage);
          if (event.data.type === "error") reject(new Error(event.data.error));
          else resolve(event.data);
        };
        worker.addEventListener("message", onMessage);
        worker.postMessage({ ...payload, id });
      });
    await new Promise<void>((resolve) =>
      worker.addEventListener("message", function ready(e) {
        if (e.data.type !== "ready") return;
        worker.removeEventListener("message", ready);
        resolve();
      }),
    );
    const sf = await fetch(
      new URL(
        "assets/soundfont/TimGM6mb.sf2",
        new URL("/GYSApp-Tauri/", location.origin).href,
      ),
    ).then((r) => r.arrayBuffer());
    await request({ type: "loadSoundFont", buffer: sf });
    const midi = (program: number, bank: number) => {
      const track = [
        0,
        0xb0,
        0,
        bank,
        0,
        0xc0,
        program,
        0,
        0x90,
        60,
        100,
        96,
        0x80,
        60,
        0,
        0,
        0xc0,
        (program + 1) % 128,
        0,
        0x90,
        64,
        100,
        96,
        0x80,
        64,
        0,
        0,
        0xff,
        0x2f,
        0,
      ];
      return new Uint8Array([
        77,
        84,
        104,
        100,
        0,
        0,
        0,
        6,
        0,
        0,
        0,
        1,
        0,
        96,
        77,
        84,
        114,
        107,
        0,
        0,
        0,
        track.length,
        ...track,
      ]).buffer;
    };
    const render = async (
      fileProgram: number,
      bank: number,
      instrument: number,
    ) => {
      const response = await request({
        type: "render",
        midiBuffer: midi(fileProgram, bank),
        sampleRate: 8000,
        tempoRate: 1,
        transpose: 0,
        instrument,
      });
      return response.left as Float32Array;
    };
    const piano = await render(0, 0, 0),
      legacy = await render(99, 5, -1),
      violin = await render(99, 5, 40);
    const difference = (other: Float32Array) => {
      let total = 0;
      for (let i = 0; i < Math.max(piano.length, other.length); i++)
        total += Math.abs((piano[i] ?? 0) - (other[i] ?? 0));
      return total / Math.max(piano.length, other.length);
    };
    const results = {
      legacyDifference: difference(legacy),
      selectedDifference: difference(violin),
      energy: piano.reduce((sum, sample) => sum + Math.abs(sample), 0),
    };
    worker.terminate();
    return results;
  });
  expect(result.energy).toBeGreaterThan(1);
  expect(result.legacyDifference).toBeLessThan(0.00001);
  expect(result.selectedDifference).toBeGreaterThan(0.001);
});
