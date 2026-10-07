import { describe, expect, it } from "vitest";
import { editPickerNumber, validPickerNumber } from "./bible-picker-number.js";

describe("Bible picker number editing", () => {
  it("replaces the selected value once, then appends chapter and verse digits", () => {
    let value = editPickerNumber({ text: "118", replace: true }, "1");
    expect(value).toEqual({ text: "1", replace: false });
    value = editPickerNumber(value, "5");
    value = editPickerNumber(value, "0");
    expect(value.text).toBe("150");
    expect(editPickerNumber(value, "1")).toEqual(value);
  });
  it("clears the selection on delete, handles corrections and leading zeroes", () => {
    expect(
      editPickerNumber({ text: "119", replace: true }, "Backspace").text,
    ).toBe("");
    expect(
      editPickerNumber({ text: "119", replace: false }, "Backspace").text,
    ).toBe("11");
    expect(editPickerNumber({ text: "0", replace: false }, "3").text).toBe("3");
    expect(editPickerNumber({ text: "3", replace: false }, "Enter").text).toBe(
      "3",
    );
  });
  it("rejects empty, zero and out-of-range references without clamping a draft", () => {
    for (const text of ["", "0", "151", "-1", "3.5", "word"])
      expect(validPickerNumber(text, 150)).toBe(false);
    expect(validPickerNumber("150", 150)).toBe(true);
    expect(validPickerNumber("176", 176)).toBe(true);
  });
});
