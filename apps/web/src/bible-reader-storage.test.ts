import { afterEach, expect, it, vi } from "vitest";
import {
  readBibleNotes,
  readBibleHighlights,
  readCustomHighlightColors,
  NOTES_KEY,
  HIGHLIGHTS_KEY,
  HIGHLIGHT_PALETTE_KEY,
} from "./bible-reader-storage.js";

afterEach(() => vi.unstubAllGlobals());
function seed(values: Record<string, unknown>) {
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => JSON.stringify(values[key] ?? null),
  });
}
it("legacy notes keep their verse identity while multiple notes retain IDs", () => {
  seed({
    [NOTES_KEY]: {
      "1:1:1": "  legacy  ",
      "1:1:2": [
        { id: "saved", text: " retained " },
        { text: "new" },
        { text: " " },
      ],
    },
  });
  expect(readBibleNotes()).toEqual({
    "1:1:1": [{ id: "legacy-1:1:1", text: "legacy" }],
    "1:1:2": [
      { id: "saved", text: "retained" },
      { id: "legacy-1:1:2-1", text: "new" },
    ],
  });
});
it("corrupt note/palette records don't remove other stored preferences", () => {
  seed({
    [NOTES_KEY]: ["invalid"],
    [HIGHLIGHTS_KEY]: {
      valid: "yellow",
      custom: "#abcdef",
      invalid: "url(bad)",
    },
    [HIGHLIGHT_PALETTE_KEY]: ["#abcdef", "#abcdef", "invalid", "#123456"],
  });
  expect(readBibleNotes()).toEqual({});
  expect(readBibleHighlights()).toEqual({ valid: "yellow", custom: "#abcdef" });
  expect(readCustomHighlightColors()).toEqual(["#abcdef", "#123456"]);
});
