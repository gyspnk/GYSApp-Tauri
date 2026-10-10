import { expect, test } from "vitest";
import { createChapterSwipe } from "./chapter-swipe.js";
const point = (x: number, y: number, identifier = 1) => ({
  clientX: x,
  clientY: y,
  identifier,
});
test("deliberate horizontal swipe works both directions within its time budget", () => {
  for (const x of [-100, 100]) {
    const swipe = createChapterSwipe();
    swipe.start([point(0, 0)], 0);
    swipe.move([point(x / 2, 2)]);
    expect(swipe.end([point(x, 4)], 0, 300)).toBe(x < 0 ? 1 : -1);
  }
});
test("vertical/diagonal intent, a later vertical segment, long press and identity changes cancel", () => {
  for (const path of [
    [point(3, 30), point(100, 32)],
    [point(30, 30), point(100, 32)],
    [point(80, 0), point(82, 20)],
    [point(100, 0, 2)],
  ]) {
    const swipe = createChapterSwipe();
    swipe.start([point(0, 0)], 0);
    path.forEach((p) => swipe.move([p]));
    expect(swipe.end([point(150, 32)], 0, 300)).toBeUndefined();
  }
  const swipe = createChapterSwipe();
  swipe.start([point(0, 0)], 0);
  expect(swipe.end([point(100, 0)], 0, 900)).toBeUndefined();
});
test("pinch and cancellation cannot restart until all fingers are released", () => {
  const swipe = createChapterSwipe();
  swipe.start([point(0, 0)], 0);
  swipe.start([point(0, 0), point(50, 0, 2)], 20);
  expect(swipe.end([point(50, 0, 2)], 1, 30)).toBeUndefined();
  swipe.start([point(0, 0)], 40);
  expect(swipe.end([point(100, 0)], 0, 50)).toBeUndefined();
  swipe.start([point(0, 0)], 60);
  swipe.cancel();
  expect(swipe.end([point(100, 0)], 0, 100)).toBeUndefined();
  swipe.start([point(0, 0)], 110);
  expect(swipe.end([point(100, 0)], 0, 200)).toBe(-1);
});
