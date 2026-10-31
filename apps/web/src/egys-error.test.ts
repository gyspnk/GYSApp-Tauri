import { describe, expect, it } from "vitest";
import { describeEgysError } from "./egys.js";

// The account panel shows whatever this returns, so a browser-internal message
// such as "signal is aborted without reason" must never reach the user.
describe("describeEgysError", () => {
  it("turns a provider timeout into an actionable sentence", () => {
    const error = new DOMException(
      "e-GYS tidak menjawab dalam 20 detik.",
      "TimeoutError",
    );
    expect(describeEgysError(error)).toBe(
      "e-GYS tidak menjawab tepat waktu. Periksa koneksi lalu coba lagi.",
    );
  });

  it("keeps a cancellation quiet and readable", () => {
    expect(
      describeEgysError(new DOMException("Dibatalkan.", "AbortError")),
    ).toBe("Permintaan ke e-GYS dibatalkan sebelum selesai. Coba lagi.");
    expect(
      describeEgysError(new Error("Signal is aborted without reason")),
    ).toBe("Permintaan ke e-GYS dibatalkan sebelum selesai. Coba lagi.");
  });

  it("explains a lost connection", () => {
    expect(describeEgysError(new TypeError("Failed to fetch"))).toBe(
      "Tidak dapat menghubungi server e-GYS. Periksa koneksi lalu coba lagi.",
    );
  });

  it("translates the BFF route wording and keeps the provider detail", () => {
    expect(
      describeEgysError(
        new Error(
          "WhatsApp code could not be verified (e-GYS 401: kode salah)",
        ),
      ),
    ).toBe("Kode WhatsApp tidak dapat diverifikasi. (e-GYS 401: kode salah)");
    expect(
      describeEgysError(
        new Error(
          "WhatsApp login is unavailable (e-GYS 504: timeout 15 detik)",
        ),
      ),
    ).toBe(
      "Login WhatsApp sedang tidak tersedia. Coba lagi sebentar lagi. (e-GYS 504: timeout 15 detik)",
    );
  });

  it("passes an unknown provider message through", () => {
    expect(describeEgysError(new Error("Nomor tidak terdaftar"))).toBe(
      "Nomor tidak terdaftar",
    );
  });

  it("falls back to one message for anything else", () => {
    expect(describeEgysError(undefined)).toBe(
      "Login e-GYS belum berhasil. Coba lagi.",
    );
    expect(describeEgysError(new Error(""))).toBe(
      "Login e-GYS belum berhasil. Coba lagi.",
    );
  });
});
