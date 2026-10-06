import { afterEach, describe, expect, it, vi } from "vitest";

const sourceRepo = "gyspnk/gyschordweb";
const sourceCommit = "e8e7efe1189b5746a2bb542348e221844091c8d1";
const generatedAt = "2026-09-24T01:54:54.299Z";
const chordRef = {
  songId: "hymn-001",
  path: "assets/chord/001_Pujilah Allah Yang Maha Esa.chord.json",
  sourceCommit,
  size: 0,
  sha256: "a".repeat(64),
};
const musicLock = {
  sourceRepo,
  sourceCommit,
  generatedAt,
  items: [
    {
      id: chordRef.path,
      kind: "chord",
      path: chordRef.path,
      size: chordRef.size,
      sha256: chordRef.sha256,
    },
  ],
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("chord manifest source compatibility", () => {
  it("downloads newer immutable chord files directly instead of calling an incompatible pinned BFF", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example");
    const doc = {
      version: 2,
      type: "note-aligned",
      pages: { "1": [{ noteIdx: 0, chord: "C" }] },
    };
    const bytes = new TextEncoder().encode(JSON.stringify(doc));
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (value) => value.toString(16).padStart(2, "0"),
    ).join("");
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(async (input) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith("assets-chord-manifest.json"))
          return jsonResponse({
            schemaVersion: 1,
            sourceCommit: "deadbee",
            files: [
              {
                bookCode: "KR",
                path: `docs/${chordRef.path}`,
                size: bytes.length,
                sha256: hash,
              },
            ],
          });
        if (url.endsWith("music-lock.json")) return jsonResponse(musicLock);
        if (url.endsWith(".chord.json")) return new Response(bytes);
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    const { createBrowserChordRepository } = await import("./chords.js");
    expect(await createBrowserChordRepository().getChord("hymn-001")).toEqual(
      doc,
    );
    expect(requests.some((url) => url.startsWith("https://bff.example"))).toBe(
      false,
    );
    expect(requests.filter((url) => url.endsWith(".chord.json"))).toHaveLength(
      1,
    );
  });

  it("checks each launch without rewriting an unchanged saved manifest", async () => {
    const upstream = {
      schemaVersion: 1,
      sourceCommit: "deadbee",
      files: [
        {
          bookCode: "KR",
          path: `docs/${chordRef.path}`,
          size: chordRef.size,
          sha256: chordRef.sha256,
        },
      ],
    };
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse(upstream),
    );
    vi.stubGlobal("fetch", fetch);
    const platform = await import("./platform.js");
    const services = platform.createPlatformServices();
    vi.spyOn(platform, "createPlatformServices").mockReturnValue(services);
    const write = vi.spyOn(services.keyValue, "set");
    const { createBrowserChordRepository } = await import("./chords.js");
    const repository = createBrowserChordRepository();
    const first = await repository.refreshManifest(undefined, true);
    const second = await repository.refreshManifest(undefined, true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenCalledOnce();
    expect(second).toEqual(first);
    expect(fetch.mock.calls[0]?.[1]).not.toHaveProperty("headers");
  });

  it("reuses a saved manifest after a conditional 304 or a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            schemaVersion: 1,
            sourceCommit: "deadbee",
            files: [
              {
                bookCode: "KR",
                path: `docs/${chordRef.path}`,
                size: chordRef.size,
                sha256: chordRef.sha256,
              },
            ],
          }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 304 }))
        .mockRejectedValueOnce(new Error("offline")),
    );
    const { createBrowserChordRepository } = await import("./chords.js");
    const repository = createBrowserChordRepository();
    const first = await repository.refreshManifest(undefined, true);
    expect(await repository.refreshManifest(undefined, true)).toEqual(first);
    expect(await repository.refreshManifest(undefined, true)).toEqual(first);
  });

  it("uses the latest immutable upstream manifest instead of the bundled commit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          schemaVersion: 1,
          sourceCommit: "deadbee",
          files: [
            {
              bookCode: "KR",
              path: `docs/${chordRef.path}`,
              size: chordRef.size,
              sha256: chordRef.sha256,
            },
          ],
        }),
      ),
    );
    const { createBrowserChordRepository } = await import("./chords.js");
    const latest = await createBrowserChordRepository().refreshManifest();
    expect(latest.sourceCommit).toBe("deadbee");
    expect(latest.entries[0]).toMatchObject({
      songId: "hymn-001",
      sourceCommit: "deadbee",
      sha256: chordRef.sha256,
    });
  });

  it.each([
    {
      name: "manifest commit",
      manifest: {
        version: 1,
        sourceRepo,
        sourceCommit: "deadbee",
        generatedAt,
        entries: [{ ...chordRef, sourceCommit: "deadbee" }],
      },
    },
    {
      name: "entry commit",
      manifest: {
        version: 1,
        sourceRepo,
        sourceCommit,
        generatedAt,
        entries: [{ ...chordRef, sourceCommit: "deadbee" }],
      },
    },
    {
      name: "missing locked chord",
      manifest: {
        version: 1,
        sourceRepo,
        sourceCommit,
        generatedAt,
        entries: [],
      },
    },
    {
      name: "misattributed chord",
      manifest: {
        version: 1,
        sourceRepo,
        sourceCommit,
        generatedAt,
        entries: [{ ...chordRef, songId: "hymn-002" }],
      },
    },
  ])(
    "uses the bundled lock when the BFF $name differs",
    async ({ manifest }) => {
      vi.resetModules();
      vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example");
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.endsWith("/api/v1/chords/manifest"))
            return jsonResponse(manifest);
          if (url.endsWith("/offline/music-lock.json"))
            return jsonResponse(musicLock);
          throw new Error(`Unexpected request: ${url}`);
        }),
      );

      const { createBrowserChordRepository } = await import("./chords.js");
      const result = await createBrowserChordRepository().refreshManifest();

      expect(result.sourceCommit).toBe(sourceCommit);
      expect(result.entries.map((entry) => entry.songId)).toEqual(["hymn-001"]);
      expect(result.entries[0]?.sourceCommit).toBe(sourceCommit);
    },
  );
});
