import { describe, expect, it } from "vitest";
import { isReadingRoute } from "./wake-lock.js";

describe("isReadingRoute", () => {
  it("identifies /bible as reading route", () => {
    expect(isReadingRoute("/bible")).toBe(true);
    expect(isReadingRoute("/bible?book=kejadian&chapter=1")).toBe(true);
  });

  it("identifies /kidung and /kidung/:id as reading routes", () => {
    expect(isReadingRoute("/kidung")).toBe(true);
    expect(isReadingRoute("/kidung/KR-001")).toBe(true);
  });

  it("identifies /literatur and /pdf as reading routes", () => {
    expect(isReadingRoute("/literatur")).toBe(true);
    expect(isReadingRoute("/literatur/item-123")).toBe(true);
    expect(isReadingRoute("/pdf")).toBe(true);
    expect(isReadingRoute("/literature")).toBe(true);
  });

  it("returns false for non-reading routes", () => {
    expect(isReadingRoute("/")).toBe(false);
    expect(isReadingRoute("/sauh")).toBe(false);
    expect(isReadingRoute("/suara")).toBe(false);
    expect(isReadingRoute("/iman")).toBe(false);
    expect(isReadingRoute("/lainnya")).toBe(false);
  });
});
