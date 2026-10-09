import { expect, it } from "vitest";
import {
  createPdfLoadActivity,
  pdfDownloadPercent,
} from "./pdf-load-progress.js";

it("reports real bytes without invented percentages for unknown totals", () => {
  expect(pdfDownloadPercent(0, 100)).toBe(0);
  expect(pdfDownloadPercent(199, 1000)).toBe(19);
  expect(pdfDownloadPercent(500, 0)).toBeUndefined();
  expect(pdfDownloadPercent(500, NaN)).toBeUndefined();
  expect(pdfDownloadPercent(1001, 1000)).toBe(100);
});
it("extends stalled-load tolerance for slow arrivals and tracks sub-percent activity", () => {
  const activity = createPdfLoadActivity(0);
  expect(activity.delay()).toBe(12000);
  expect(activity.update(1, 5000)).toBe(true);
  expect(activity.delay()).toBe(20000);
  expect(activity.update(1, 6000)).toBe(false);
  expect(activity.update(2, 15000)).toBe(true);
  expect(activity.delay()).toBe(30000);
  expect(activity.update(3, 15100)).toBe(true);
  expect(activity.delay()).toBe(12000);
});
