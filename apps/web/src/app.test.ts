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
    expect(translate("id", "home.title")).toBe("Bacaan & nyanyian");
    expect(translate("en", "home.title")).toBe("Readings & hymns");
    expect(translate("zh", "home.title")).toBe("阅读与诗歌");
    expect(translate("id", "missing.key")).toBe("missing.key");
  });
});
