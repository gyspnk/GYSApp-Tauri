export const REPORT_EMAIL = "thengilbert@gmail.com";

/**
 * The report leaves through the reader's own mail client: no BFF round trip,
 * and the message lands at the address the owner actually reads. The body
 * carries just enough context to reproduce the problem without exposing the
 * reader's private data.
 */
export function buildReportMailto(
  message: string,
  context: {
    locale: string;
    path: string;
    search?: string;
    subject?: string;
    now?: Date;
  },
): string {
  const stamp = (context.now ?? new Date()).toISOString();
  const body = [
    message.trim(),
    "",
    "—",
    `Halaman: ${context.path}${context.search ?? ""}`,
    `Bahasa: ${context.locale}`,
    `Waktu: ${stamp}`,
  ].join("\n");
  const params = new URLSearchParams({
    subject: context.subject ?? "GYSApp problem report",
    body,
  });
  return `mailto:${REPORT_EMAIL}?${params.toString()}`;
}
