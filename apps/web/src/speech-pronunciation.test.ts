import { describe, expect, it } from "vitest";
import { localVoiceText } from "./speech-pronunciation.js";

describe("local voice pronunciation", () => {
  it("breaks Allah where a device voice stresses it wrong", () => {
    expect(localVoiceText("Pada mulanya Allah menciptakan langit")).toBe(
      "Pada mulanya Al-lah menciptakan langit",
    );
  });

  it("keeps the shout case readable", () => {
    expect(localVoiceText("ALLAH itu kasih")).toBe("Al-lah itu kasih");
  });

  it("leaves the spelled form alone and does not break other words", () => {
    expect(localVoiceText("Al-lah")).toBe("Al-lah");
    expect(localVoiceText("Allahu Akbar")).toBe("Allahu Akbar");
    expect(localVoiceText("Allahku")).toBe("Allahku");
  });
});
