import { describe, expect, it } from "vitest";
import { routeTitle } from "./route-a11y.js";

describe("routeTitle", () => {
  it("combines the page heading with the app name", () => {
    expect(routeTitle("Alkitab")).toBe("Alkitab · GYSApp");
  });

  it("collapses whitespace and ignores an empty heading", () => {
    expect(routeTitle("  Kidung\n  pujian ")).toBe("Kidung pujian · GYSApp");
    expect(routeTitle(undefined)).toBe("GYSApp");
    expect(routeTitle("   ")).toBe("GYSApp");
  });
});
