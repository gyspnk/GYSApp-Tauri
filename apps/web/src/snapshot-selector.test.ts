import { expect, it } from "vitest";
import { createSnapshotSelector } from "./snapshot-selector.js";

it("transport position ticks do not invalidate reader state, but song/settings/error changes do", () => {
  let source = {
    position: 0,
    songId: "001",
    status: "playing",
    volume: 1,
    error: undefined as string | undefined,
  };
  const read = createSnapshotSelector(
    () => source,
    ({ position: _position, ...reader }) => reader,
  );
  const initial = read();
  source = { ...source, position: 1 };
  expect(read()).toBe(initial);
  source = { ...source, songId: "002" };
  expect(read()).not.toBe(initial);
  const second = read();
  source = { ...source, volume: 0.5 };
  expect(read()).not.toBe(second);
  source = { ...source, status: "error", error: "render failed" };
  expect(read()).toMatchObject({ status: "error", error: "render failed" });
});
