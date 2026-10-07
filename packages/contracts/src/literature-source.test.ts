import { describe, expect, it } from "vitest";
import {
  extractOfficialPdfUrl,
  isOfficialPdfUrl,
  literatureIssuePostUrl,
} from "./literature-source.js";

describe("official literature PDF boundary", () => {
  it("extracts relative embeds and HTML-escaped PDF queries while skipping external links", () => {
    const source = "https://tjc.org/id/warta-sejati/ws-4/";
    expect(
      extractOfficialPdfUrl(
        [
          {
            content: {
              rendered:
                '<a href="https://other.example/first.pdf">Other</a><iframe src="/id/wp-content/uploads/news.pdf?v=2&amp;download=1"></iframe>',
            },
          },
        ],
        source,
      ),
    ).toBe("https://tjc.org/id/wp-content/uploads/news.pdf?v=2&download=1");
    expect(
      extractOfficialPdfUrl(
        [
          {
            content: {
              rendered:
                '<div data-url="https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/Pelita-Kecil-46-WEB.pdf"></div>',
            },
          },
        ],
        source,
      ),
    ).toContain("Pelita-Kecil-46-WEB.pdf");
    expect(
      extractOfficialPdfUrl(
        [{ content: { rendered: "<p>Nothing here</p>" } }],
        source,
      ),
    ).toBeUndefined();
  });

  it("resolves only issue posts and requests just the required content field", () => {
    const endpoint = new URL(
      literatureIssuePostUrl("https://tjc.org/id/pelitakecil/pk46/")!,
    );
    expect(endpoint.pathname).toBe("/id/wp-json/wp/v2/posts");
    expect(Object.fromEntries(endpoint.searchParams)).toEqual({
      slug: "pk46",
      per_page: "1",
      _fields: "content",
    });
    for (const value of [
      "https://evil.example/id/warta-sejati/ws-4/",
      "http://tjc.org/id/warta-sejati/ws-4/",
      "https://tjc.org/id/kesaksian/article/",
      "https://tjc.org/id/warta-sejati/",
    ])
      expect(literatureIssuePostUrl(value)).toBeUndefined();
  });

  it("rejects credentials, insecure/custom-port sources and unrelated S3 paths", () => {
    for (const value of [
      "http://tjc.org/file.pdf",
      "https://user@tjc.org/file.pdf",
      "https://tjc.org:8443/file.pdf",
      "https://tjc.org/file.pdf.exe",
      "https://tjc.org.evil.example/file.pdf",
      "https://tjcorguploads.s3.amazonaws.com/private/file.pdf",
    ])
      expect(isOfficialPdfUrl(value)).toBe(false);
    expect(isOfficialPdfUrl("https://www.tjc.org/id/file.PDF#page=2")).toBe(
      true,
    );
  });
});
