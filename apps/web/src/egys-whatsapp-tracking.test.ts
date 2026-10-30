import { describe, expect, it } from "vitest";
import {
  describeTrackingGap,
  normalizeSenderPhone,
  parseWhatsAppTrackingEvent,
} from "./egys-whatsapp-tracking.js";

const reference = "5713444545";

describe("parseWhatsAppTrackingEvent", () => {
  it("confirms with the documented camelCase payload", () => {
    expect(
      parseWhatsAppTrackingEvent(
        { refid: "5713444545", otp: "123456", mobilePhone: "628987654321" },
        reference,
      ),
    ).toEqual({
      type: "confirm",
      otp: "123456",
      senderPhone: "628987654321",
    });
  });

  it("accepts a numeric refid and lowercase sender field", () => {
    expect(
      parseWhatsAppTrackingEvent(
        { refid: 5713444545, otp: 4821, mobilephone: "628987654321" },
        reference,
      ),
    ).toEqual({ type: "confirm", otp: "4821", senderPhone: "628987654321" });
  });

  it("accepts a formatted plus-prefixed sender phone", () => {
    expect(
      parseWhatsAppTrackingEvent(
        { refId: reference, code: "4821", sender: "+62 898-7654-321" },
        reference,
      ),
    ).toEqual({ type: "confirm", otp: "4821", senderPhone: "+628987654321" });
  });

  it("rejects a confirmation for another attempt", () => {
    expect(
      parseWhatsAppTrackingEvent(
        { refid: "unrelated", otp: "123456", mobilePhone: "628987654321" },
        reference,
      ),
    ).toBeNull();
  });

  it("never confirms a non-numeric code for a matching reference", () => {
    expect(
      parseWhatsAppTrackingEvent(
        { refid: reference, otp: "12ab56", mobilePhone: "628987654321" },
        reference,
      ),
    ).toEqual({ type: "incomplete", otp: false, senderPhone: true });
  });

  it("reports an incomplete payload instead of confirming it", () => {
    expect(
      parseWhatsAppTrackingEvent(
        { refid: reference, otp: "123456" },
        reference,
      ),
    ).toEqual({ type: "incomplete", otp: true, senderPhone: false });
  });

  it("surfaces upstream error frames with their message", () => {
    expect(
      parseWhatsAppTrackingEvent(
        { type: "error", message: "message expired" },
        reference,
      ),
    ).toEqual({ type: "error", message: "message expired" });
  });

  it("keeps a status frame informational", () => {
    expect(
      parseWhatsAppTrackingEvent(
        { type: "info", message: "Success open socket in server" },
        reference,
      ),
    ).toEqual({ type: "info" });
  });

  it("ignores non-object payloads", () => {
    expect(parseWhatsAppTrackingEvent("ping", reference)).toBeNull();
    expect(parseWhatsAppTrackingEvent(null, reference)).toBeNull();
    expect(parseWhatsAppTrackingEvent([1, 2], reference)).toBeNull();
  });
});

describe("normalizeSenderPhone", () => {
  it.each([
    ["628987654321", "628987654321"],
    ["+628987654321", "+628987654321"],
    ["6289 8765 4321", "628987654321"],
  ])("normalises %s", (input, expected) => {
    expect(normalizeSenderPhone(input)).toBe(expected);
  });

  it.each([["abc"], [""], ["12345"], ["1234567890123456789012"], [null], [{}]])(
    "rejects %s",
    (input) => {
      expect(normalizeSenderPhone(input)).toBeNull();
    },
  );
});

describe("describeTrackingGap", () => {
  it("names the fields that blocked a matching reference", () => {
    const gap = describeTrackingGap(
      { refid: reference, otp: "123456" },
      reference,
    );
    expect(gap).toContain("reference matched");
    expect(gap).toContain("sender=missing");
    expect(gap).toContain("keys=otp,refid");
  });

  it("stays silent for events that already confirm or do not match", () => {
    expect(
      describeTrackingGap(
        { refid: reference, otp: "123456", mobilePhone: "628987654321" },
        reference,
      ),
    ).toBeNull();
    expect(describeTrackingGap({ refid: "other" }, reference)).toBeNull();
    expect(describeTrackingGap({ type: "info" }, reference)).toBeNull();
  });
});
