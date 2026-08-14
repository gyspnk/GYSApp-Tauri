import { describe, expect, it } from "vitest";
import { DESTINATIONS } from "./navigation.js";
import { translate } from "./i18n.js";

describe("Quiet Sanctuary navigation", () => {
  it("keeps the five canonical destinations in stable order", () => {
    expect(DESTINATIONS.map((item) => item.path)).toEqual([
      "/",
      "/bible",
      "/kidung",
      "/iman",
      "/lainnya",
    ]);
    expect(DESTINATIONS).toHaveLength(5);
  });

  it("provides Indonesian, English, and Chinese labels with safe fallback", () => {
    expect(translate("id", "home.title")).toBe("Selamat datang kembali");
    expect(translate("en", "home.title")).toBe("Welcome back");
    expect(translate("zh", "home.title")).toBe("欢迎回来");
    expect(translate("id", "missing.key")).toBe("missing.key");
  });
});
