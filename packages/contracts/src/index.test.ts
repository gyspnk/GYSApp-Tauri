import { describe, expect, it } from "vitest";
import {
  AccountProfileSchema,
  BiblePackManifestSchema,
  BibleReaderPackSchema,
  DistributedAssetCatalogSchema,
  ChordDocumentV2Schema,
  EdgeTtsRequestSchema,
  EdgeTtsVoicesResponseSchema,
  ErrorResponseSchema,
  HymnCatalogEntrySchema,
  HymnalPdfManifestSchema,
  LiteratureCatalogSchema,
  OnlineArticleSchema,
  SuaraSejatiFeedSchema,
  UpstreamMusicLockSchema,
} from "./index.js";

describe("public contracts", () => {
  it("accepts an immutable upstream music lock with hashed items", () => {
    const result = UpstreamMusicLockSchema.safeParse({
      sourceRepo: "gyspnk/gyschordweb",
      sourceCommit: "a3d1ea7",
      generatedAt: "2026-08-14T00:00:00.000Z",
      items: [
        {
          id: "hymn-001",
          kind: "midi",
          path: "assets/midi/001.mid",
          size: 42,
          sha256: "a".repeat(64),
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects a lock item with a non-sha256 digest", () => {
    const result = UpstreamMusicLockSchema.safeParse({
      sourceRepo: "gyspnk/gyschordweb",
      sourceCommit: "a3d1ea7",
      generatedAt: "2026-08-14T00:00:00.000Z",
      items: [{ id: "x", kind: "pdf", path: "x.pdf", size: 1, sha256: "bad" }],
    });

    expect(result.success).toBe(false);
  });

  it("models chord note alignment and source provenance", () => {
    const parsed = ChordDocumentV2Schema.parse({
      version: 2,
      songId: "hymn-001",
      title: "Kasih Setia-Mu",
      key: "C",
      sourceCommit: "a3d1ea7",
      sourcePath: "assets/chords/001.json",
      verses: [
        {
          label: "1",
          lines: [
            { text: "Kasih setia-Mu", chords: [{ token: "C", index: 0 }] },
          ],
        },
      ],
    });

    if (!("verses" in parsed)) throw new Error("normalized chord expected");
    expect(parsed.verses[0]?.lines[0]?.chords[0]?.token).toBe("C");
  });

  it("accepts canonical note-aligned page documents", () => {
    const parsed = ChordDocumentV2Schema.parse({
      version: 2,
      type: "note-aligned",
      pages: { "1": [{ noteIdx: 0, chord: "C" }] },
    });
    expect(parsed.version).toBe(2);
  });

  it("accepts canonical intro and outro note sentinels", () => {
    const parsed = ChordDocumentV2Schema.parse({
      version: 2,
      type: "note-aligned",
      pages: {
        "1": [
          { noteIdx: -1, chord: "C" },
          { noteIdx: 99999, chord: "G" },
        ],
      },
    });
    expect(parsed).toMatchObject({ version: 2, type: "note-aligned" });
  });

  it("validates the generated TB pack manifest", () => {
    const parsed = BiblePackManifestSchema.parse({
      version: "1",
      translation: "TB",
      generatedAt: "2026-08-14T00:00:00.000Z",
      sha256: "a".repeat(64),
      bytes: 21_340_160,
      books: 66,
    });
    expect(parsed.translation).toBe("TB");
  });

  it("accepts a distributed Bible translation code", () => {
    const manifest = BiblePackManifestSchema.safeParse({
      version: "1",
      translation: "KJV",
      generatedAt: "2026-08-14T00:00:00.000Z",
      sha256: "b".repeat(64),
      bytes: 1_935_399,
      books: 66,
    });
    const reader = BibleReaderPackSchema.safeParse({
      version: 1,
      translation: "KJV",
      source: "ThenGB/GYSApp-Data@bibles-2026.05.21",
      books: [{ id: 1, short: "Gen", name: "Genesis", chapters: 50 }],
      verses: [
        {
          id: "1:1:1",
          book: "1",
          bookOrder: 1,
          chapter: 1,
          verse: 1,
          text: "In the beginning",
        },
      ],
    });

    expect(manifest.success).toBe(true);
    expect(reader.success).toBe(true);
  });

  it("validates the GYSApp-Data distributed asset catalog", () => {
    const parsed = DistributedAssetCatalogSchema.parse({
      version: 1,
      generatedAt: "2026-08-18T00:00:00.000Z",
      sourceRepo: "ThenGB/GYSApp-Data",
      items: [
        {
          kind: "bible",
          code: "b_kjv",
          title: "King James Version",
          track: "bibles",
          bundledByDefault: false,
          version: "2026.05.21",
          releaseTag: "bibles-2026.05.21",
          fileName: "b_kjv.gyspkg",
          downloadUrl:
            "https://github.com/ThenGB/GYSApp-Data/releases/download/bibles-2026.05.21/b_kjv.gyspkg",
          installFileName: "b_kjv.db",
          sizeBytes: 1_935_399,
          checksumSha256: "c".repeat(64),
          metadata: {
            sourceRepo: "ThenGB/GYSAPP-Fork",
            sourceCommit: "4f0d39b",
            path: "assets/data/index/hymne_index.json",
            downloadUrl:
              "https://raw.githubusercontent.com/ThenGB/GYSAPP-Fork/4f0d39b/assets/data/index/hymne_index.json",
            sizeBytes: 740_939,
            checksumSha256: "d".repeat(64),
          },
        },
      ],
    });

    expect(parsed.items[0]?.code).toBe("b_kjv");
    expect(parsed.items[0]?.metadata?.sourceCommit).toBe("4f0d39b");
  });

  it("validates the browser TB reader projection", () => {
    const parsed = BibleReaderPackSchema.parse({
      version: 1,
      translation: "TB",
      source: "ThenGB/GYSAPP-Fork@4f0d39b",
      books: [{ id: 1, short: "Kej", name: "Kejadian", chapters: 50 }],
      verses: [
        {
          id: "1:1:1",
          book: "1",
          bookOrder: 1,
          chapter: 1,
          verse: 1,
          text: "Pada mulanya",
        },
      ],
    });
    expect(parsed.books[0]?.name).toBe("Kejadian");
  });

  it("normalizes profile and structured errors", () => {
    expect(
      AccountProfileSchema.parse({ id: "u1", displayName: "Grace" })
        .displayName,
    ).toBe("Grace");
    expect(
      ErrorResponseSchema.parse({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request",
          requestId: "r1",
        },
      }).error.code,
    ).toBe("VALIDATION_ERROR");
  });

  it("preserves current e-GYS operational capabilities", () => {
    const profile = AccountProfileSchema.parse({
      id: "u1",
      displayName: "Grace",
      permissions: {
        viewMembers: true,
        viewBranches: true,
        viewEvents: true,
        createEvents: false,
        updateEvents: false,
        archiveEvents: false,
      },
    });
    expect(profile.permissions).toMatchObject({
      viewBranches: true,
      viewEvents: true,
      archiveEvents: false,
    });
  });

  it("keeps hymn verses and upstream content sources explicit", () => {
    const hymn = HymnCatalogEntrySchema.parse({
      id: "hymn-001",
      book: "rohani",
      number: 1,
      title: "Pujilah",
      verses: ["Bait pertama"],
      lyrics: "Bait pertama",
      midiPath: "assets/midi/001.mid",
      pdfPath: "assets/pdf/001.pdf",
    });
    expect(hymn.verses).toHaveLength(1);
    expect(
      LiteratureCatalogSchema.parse({
        source: "tjc.org",
        generatedAt: "2026-08-14T00:00:00.000Z",
        items: [
          {
            id: "kesaksian-1",
            category: "kesaksian",
            title: "Kesaksian",
            description: "",
            url: "https://tjc.org/id/kesaksian/",
            updatedAt: "2026-08-14T00:00:00.000Z",
            source: "tjc.org",
          },
        ],
      }).items,
    ).toHaveLength(1);
  });

  it("matches the fork PDF database contract", () => {
    expect(
      HymnalPdfManifestSchema.parse({
        sourceRepo: "ThenGB/GYSAPP-Fork",
        sourceCommit: "4f0d39b",
        generatedAt: "2026-08-14T00:00:00.000Z",
        bookCode: "KR",
        masterPath: "assets/data/pdf/kr/kr_master.pdf",
        pageCount: 649,
        songs: { "001": { startPage: 5, pageCount: 1, source: "001.pdf" } },
      }).songs["001"]?.startPage,
    ).toBe(5);
  });

  it("keeps media provenance and native e-GYS profile fields typed", () => {
    expect(
      SuaraSejatiFeedSchema.parse({
        source: "tjc.org",
        generatedAt: "2026-08-14T00:00:00.000Z",
        items: [
          {
            id: "cahaya",
            title: "Cahaya Kehidupan",
            excerpt: "Kesaksian",
            url: "https://tjc.org/id/suarasejati/cahaya/",
            imageUrl: "https://tjc.org/id/wp-content/uploads/cover.jpg",
            publishedAt: "2023-12-13T00:00:00.000Z",
            source: "tjc.org",
          },
        ],
      }).items,
    ).toHaveLength(1);
    expect(
      AccountProfileSchema.parse({
        id: "account-1",
        personId: "person-1",
        displayName: "Jemaat",
        branchName: "Jakarta Selatan",
        memberStatus: "aktif",
        isMember: true,
        provider: "egys",
      }).isMember,
    ).toBe(true);
  });

  it("validates bounded internal article reader documents", () => {
    const article = OnlineArticleSchema.parse({
      id: "id/kesaksian/cahaya",
      title: "Cahaya",
      body: "Isi yang sudah dinormalisasi.",
      url: "https://tjc.org/id/kesaksian/cahaya/",
      source: "tjc.org",
      fetchedAt: "2026-08-14T00:00:00.000Z",
    });
    expect(article.source).toBe("tjc.org");
  });

  it("validates bounded Edge speech requests", () => {
    const request = EdgeTtsRequestSchema.parse({
      text: "Firman untuk hari ini",
      voice: "id-ID-GadisNeural",
      rate: 0.9,
      pitch: 1,
      volume: 1,
    });
    expect(request.text).toContain("hari ini");
    expect(
      EdgeTtsRequestSchema.safeParse({ text: "x", voice: "not a voice" })
        .success,
    ).toBe(false);
  });

  it("accepts only gateway-advertised remote voices", () => {
    const response = EdgeTtsVoicesResponseSchema.parse({
      voices: [
        {
          id: "id-ID-GadisNeural",
          name: "Gadis",
          language: "id-ID",
        },
      ],
    });
    expect(response.voices[0]?.local).toBe(false);
    expect(
      EdgeTtsVoicesResponseSchema.safeParse({
        voices: [{ id: "bad id", name: "Unknown", language: "id-ID" }],
      }).success,
    ).toBe(false);
  });
});
