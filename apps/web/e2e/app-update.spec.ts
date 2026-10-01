import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const worker = new EventTarget() as EventTarget & {
      state: string;
      postMessage: (message: { type: string }) => void;
    };
    worker.state = "installed";
    worker.postMessage = (message) => {
      if (message.type === "SKIP_WAITING")
        localStorage.setItem("gys-e2e-update-activation", "requested");
    };
    const registration = new EventTarget() as EventTarget & {
      waiting: typeof worker;
      installing: null;
      active: { postMessage: () => void };
      update: () => Promise<void>;
    };
    Object.assign(registration, {
      waiting: worker,
      installing: null,
      active: { postMessage() {} },
      update: async () => undefined,
    });
    const serviceWorker = new EventTarget();
    Object.assign(serviceWorker, {
      controller: {},
      ready: Promise.resolve(registration),
      register: async () => registration,
    });
    Object.defineProperty(navigator, "serviceWorker", {
      value: serviceWorker,
      configurable: true,
    });
  });
});

test("an available update preserves reading and unsaved notes until leaving the reader", async ({
  page,
}) => {
  test.skip(process.env.GYS_E2E_DEV === "1", "Production update coordinator");
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.locator(".verse-row").first()).toBeVisible();
  const banner = page.locator(".app-update-banner");
  await expect(banner).toBeVisible();
  await expect(banner.locator("button")).toBeDisabled();
  await page.locator(".verse-text").first().click();
  await page.getByRole("button", { name: "Catatan ayat", exact: true }).click();
  const draft = page.getByLabel("Catatan pribadi");
  await draft.fill("Unsaved note survives a controller change");
  await page.evaluate(() =>
    navigator.serviceWorker.dispatchEvent(new Event("controllerchange")),
  );
  await expect(draft).toHaveValue("Unsaved note survives a controller change");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("gys-e2e-update-activation"),
    ),
  ).toBeNull();
});

test("activation is explicit and disabled for an unsubmitted editor", async ({
  page,
}) => {
  test.skip(process.env.GYS_E2E_DEV === "1", "Production update coordinator");
  await page.goto("/GYSApp-Tauri/");
  const banner = page.locator(".app-update-banner");
  await expect(banner).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("gys-e2e-update-activation"),
    ),
  ).toBeNull();
  await page.evaluate(() => {
    const input = document.createElement("textarea");
    input.id = "unsaved-editor";
    document.body.append(input);
  });
  await page.locator("#unsaved-editor").fill("Unsaved text");
  await page.locator(".home-page h1").click();
  await expect(banner.locator("button")).toBeDisabled();
  await page.locator("#unsaved-editor").evaluate((element) => element.remove());
  await expect(banner.locator("button")).toBeEnabled();
  await banner.locator("button").click();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("gys-e2e-update-activation")),
    )
    .toBe("requested");
});
