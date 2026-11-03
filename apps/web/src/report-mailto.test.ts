import { describe, expect, it } from "vitest";
import { buildReportMailto, REPORT_EMAIL } from "./report-mailto.js";

describe("report mailto", () => {
  const now = new Date("2026-11-03T02:40:00.000Z");

  it("addresses the owner and keeps the message intact", () => {
    const href = buildReportMailto("  Kidung tidak mau scroll  ", {
      locale: "id",
      path: "/GYSApp-Tauri/kidung/hymn-001",
      now,
    });
    expect(href.startsWith(`mailto:${REPORT_EMAIL}?`)).toBe(true);
    const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect(params.get("subject")).toBe("GYSApp problem report");
    expect(params.get("body")).toContain("Kidung tidak mau scroll");
    expect(params.get("body")).toContain(
      "Halaman: /GYSApp-Tauri/kidung/hymn-001",
    );
    expect(params.get("body")).toContain("Bahasa: id");
    expect(params.get("body")).toContain("Waktu: 2026-11-03T02:40:00.000Z");
  });

  it("keeps the query string of a deep link", () => {
    const href = buildReportMailto("x", {
      locale: "en",
      path: "/GYSApp-Tauri/lainnya",
      search: "?section=help",
      now,
    });
    const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect(params.get("body")).toContain(
      "Halaman: /GYSApp-Tauri/lainnya?section=help",
    );
    expect(params.get("body")).toContain("Bahasa: en");
  });
});
