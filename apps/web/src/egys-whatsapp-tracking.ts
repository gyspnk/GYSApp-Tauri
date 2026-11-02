/**
 * Normalises one official WhatsApp tracking event.
 *
 * The relay forwards the upstream frame verbatim, so the runtime payload is the
 * service's own shape rather than a contract we control. Comparison against the
 * reference stays strict: an event for another login attempt, a non-numeric code
 * or a missing sender phone is dropped instead of confirming the wrong session.
 * Field aliases only widen which identifier a valid event may arrive under.
 */

export type WhatsAppTrackingEvent =
  | { type: "info" }
  | { type: "error"; message: string }
  | { type: "confirm"; otp: string; senderPhone: string }
  // Only produced for diagnostics: the reference matched but the payload could
  // not authorise a session, so the attempt keeps waiting instead of failing.
  | { type: "incomplete"; otp: boolean; senderPhone: boolean };

const OTP_KEYS = ["otp", "code", "otpCode", "otpcode", "otp_code"] as const;
const SENDER_KEYS = [
  "mobilePhone",
  "mobilephone",
  "sender",
  "senderPhone",
  "senderphone",
  "from",
  "phone",
] as const;
const REFERENCE_KEYS = [
  "refid",
  "refId",
  "referenceid",
  "referenceId",
] as const;

function readField(
  record: Record<string, unknown>,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

/** Returns `+`-prefixed digits for a phone-like value, or null when invalid. */
export function normalizeSenderPhone(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length < 6 || digits.length > 20) return null;
  return raw.startsWith("+") ? `+${digits}` : digits;
}

function normalizeOtp(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const digits = String(value).trim();
  return /^[0-9]{4,12}$/.test(digits) ? digits : null;
}

export function parseWhatsAppTrackingEvent(
  payload: unknown,
  reference: string,
): WhatsAppTrackingEvent | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return null;
  const record = payload as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  if (type === "error")
    return {
      type: "error",
      message: typeof record.message === "string" ? record.message : "",
    };

  const otp = normalizeOtp(readField(record, OTP_KEYS));
  const senderPhone = normalizeSenderPhone(readField(record, SENDER_KEYS));
  const eventReference = readField(record, REFERENCE_KEYS);
  // A confirmation must belong to this attempt. Comparing the stringified
  // values accepts the service returning the reference as a number.
  const referenceMatches =
    eventReference !== undefined &&
    String(eventReference).trim() === String(reference).trim();

  if (otp && senderPhone && referenceMatches)
    return { type: "confirm", otp, senderPhone };

  if (type === "info") return { type: "info" };
  if (referenceMatches && (!otp || !senderPhone))
    return {
      type: "incomplete",
      otp: Boolean(otp),
      senderPhone: Boolean(senderPhone),
    };
  return null;
}

/** Describes why an otherwise relevant payload did not confirm a session. */
export function describeTrackingGap(
  payload: unknown,
  reference: string,
): string | null {
  const parsed = parseWhatsAppTrackingEvent(payload, reference);
  if (!parsed || parsed.type !== "incomplete") return null;
  const record = payload as Record<string, unknown>;
  const keys = Object.keys(record).sort().join(",");
  return `reference matched but fields were incomplete (otp=${parsed.otp ? "ok" : "missing"}, sender=${parsed.senderPhone ? "ok" : "missing"}, keys=${keys})`;
}
