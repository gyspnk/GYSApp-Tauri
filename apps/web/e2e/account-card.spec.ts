import { expect, test } from "@playwright/test";

// A one-pixel PNG is enough: the card only has to prove it uses the profile
// photo when one exists, not that the network returned a good picture.
const AVATAR =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const profile = {
  id: "member-123",
  displayName: "Sdr. Yohanes",
  branchName: "Semarang",
  branchCode: "SMG",
  isMember: true,
  membershipNo: "GYS-SMG-001",
  email: "yohanes@example.org",
  avatarUrl: AVATAR,
  locale: "id",
};

const openAccount = async (page: import("@playwright/test").Page) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.route("**/api/v1/account/profile**", (route) =>
    route.fulfill({ json: { profile } }),
  );
  await page.addInitScript((value) => {
    localStorage.setItem("gys-egys-profile-v1", JSON.stringify(value));
  }, profile);
  await page.goto("/GYSApp-Tauri/lainnya?section=account");
  const card = page.locator(".member-card");
  await expect(card).toBeVisible({ timeout: 20_000 });
  return card;
};

test.describe("member account card", () => {
  test("shows the profile photo and the details without repeating the church name", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const card = await openAccount(page);

    const avatar = card.locator(".member-card-avatar img");
    await expect(avatar).toHaveCount(1);
    expect(await avatar.evaluate((node) => node.naturalWidth)).toBeGreaterThan(
      0,
    );

    await expect(card.getByText("Gereja Yesus Sejati")).toHaveCount(0);
    await expect(card).toContainText("Sdr. Yohanes");
    await expect(card).toContainText("Jemaat Resmi");
    await expect(card).toContainText("Semarang");
    await expect(card).toContainText("GYS-SMG-001");
    await expect(card).toContainText("yohanes@example.org");
  });

  test("keeps the sign-out button clear of the card border and fills a wide panel", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const card = await openAccount(page);

    const columns = await card
      .locator(".member-card-fields")
      .evaluate(
        (node) =>
          getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean)
            .length,
      );
    expect(columns).toBeGreaterThanOrEqual(2);

    const cardBox = (await card.boundingBox())!;
    const actionBox = (await card
      .locator(".member-card-actions")
      .boundingBox())!;
    const button = card.getByRole("button", { name: /Keluar dari Akun Ini/i });
    const buttonBox = (await button.boundingBox())!;
    // The old markup drew the separator and started the button in the same
    // pixel row, so the line ran through its top edge. The row must own
    // breathing room above the button, and the card must end below it.
    expect(buttonBox.y - actionBox.y).toBeGreaterThanOrEqual(12);
    const gapBelow =
      cardBox.y + cardBox.height - (buttonBox.y + buttonBox.height);
    expect(gapBelow).toBeGreaterThanOrEqual(12);
    expect(buttonBox.height).toBeGreaterThanOrEqual(44);
    expect(cardBox.width).toBeGreaterThan(700);
  });

  test("keeps the three sign-in providers in one row without overlapping", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.route("**/api/v1/account/profile**", (route) =>
      route.fulfill({ status: 401, json: { ok: false } }),
    );
    await page.goto("/GYSApp-Tauri/lainnya?section=account");
    const row = page.locator(".egys-provider-methods");
    await expect(row).toBeVisible({ timeout: 20_000 });
    const boxes = await row.locator(".egys-provider").evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return {
          top: Math.round(box.top),
          left: Math.round(box.left),
          right: Math.round(box.right),
          height: box.height,
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
        };
      }),
    );
    // Google's injected control used to collapse to an 18 px strip that spilled
    // over its neighbour; one row, one height, nothing overflowing.
    expect(boxes).toHaveLength(3);
    expect(new Set(boxes.map((box) => box.top)).size).toBe(1);
    for (let index = 1; index < boxes.length; index += 1) {
      expect(boxes[index]!.left).toBeGreaterThanOrEqual(
        boxes[index - 1]!.right - 1,
      );
    }
    for (const box of boxes) {
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1);
    }
  });
});
