import { describe, expect, it } from "vitest";

import { destinationForPath } from "./navigation.js";

describe("destinationForPath", () => {
  it("marks the destination that owns the route", () => {
    expect(destinationForPath("/")).toBe("/");
    expect(destinationForPath("/bible")).toBe("/bible");
    expect(destinationForPath("/kidung/hymn-001")).toBe("/kidung");
    expect(destinationForPath("/lainnya")).toBe("/lainnya");
  });

  it("files collection pages under Lainnya, not Beranda", () => {
    expect(destinationForPath("/suara")).toBe("/lainnya");
    expect(destinationForPath("/suara/147-menapaki-tiga-iman")).toBe(
      "/lainnya",
    );
    expect(destinationForPath("/literatur")).toBe("/lainnya");
    expect(destinationForPath("/sauh")).toBe("/lainnya");
  });

  it("falls back to Beranda for unknown routes", () => {
    expect(destinationForPath("/tidak-ada")).toBe("/");
  });
});
