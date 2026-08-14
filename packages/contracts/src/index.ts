import { z } from "zod";

export const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/i, "sha256 must be a 64-character hexadecimal digest");
export const SourceCommitSchema = z
  .string()
  .regex(/^[a-f0-9]{7,64}$/i, "sourceCommit must be an immutable git commit");

export const UpstreamMusicItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["midi", "pdf", "chord", "soundfont", "metadata", "asset"]),
  path: z
    .string()
    .min(1)
    .refine(
      (value) => !value.includes(".."),
      "asset paths cannot escape their root",
    ),
  size: z.number().int().nonnegative(),
  sha256: Sha256Schema,
});

export const UpstreamMusicLockSchema = z.object({
  sourceRepo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  sourceCommit: SourceCommitSchema,
  generatedAt: z.string().datetime({ offset: true }),
  items: z.array(UpstreamMusicItemSchema),
});
export type UpstreamMusicLock = z.infer<typeof UpstreamMusicLockSchema>;
export type UpstreamMusicItem = z.infer<typeof UpstreamMusicItemSchema>;

export const ChordRefSchema = z.object({
  songId: z.string().min(1),
  path: z.string().min(1),
  sourceCommit: SourceCommitSchema,
  size: z.number().int().nonnegative(),
  sha256: Sha256Schema,
});
export type ChordRef = z.infer<typeof ChordRefSchema>;

export const ChordManifestV1Schema = z.object({
  version: z.literal(1),
  sourceRepo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  sourceCommit: SourceCommitSchema,
  generatedAt: z.string().datetime({ offset: true }),
  entries: z.array(ChordRefSchema),
});
export type ChordManifestV1 = z.infer<typeof ChordManifestV1Schema>;

export const ChordTokenSchema = z.object({
  token: z.string().min(1),
  index: z.number().int().nonnegative(),
});
export const ChordLineSchema = z.object({
  text: z.string(),
  chords: z.array(ChordTokenSchema),
});
export const ChordVerseSchema = z.object({
  label: z.string().min(1),
  lines: z.array(ChordLineSchema),
});
const NormalizedChordDocumentV2Schema = z.object({
  version: z.literal(2),
  songId: z.string().min(1),
  title: z.string().min(1),
  key: z.string().min(1),
  sourceCommit: SourceCommitSchema,
  sourcePath: z.string().min(1),
  verses: z.array(ChordVerseSchema),
});
const NoteAlignedChordDocumentV2Schema = z.object({
  version: z.literal(2),
  type: z.literal("note-aligned"),
  pages: z.record(
    z.string(),
    z.array(
      z.object({
        noteIdx: z.number().int().nonnegative(),
        chord: z.string().min(1),
      }),
    ),
  ),
});
export const ChordDocumentV2Schema = z.union([
  NormalizedChordDocumentV2Schema,
  NoteAlignedChordDocumentV2Schema,
]);
export type ChordDocumentV2 = z.infer<typeof ChordDocumentV2Schema>;

export const HymnCatalogEntrySchema = z.object({
  id: z.string().min(1),
  book: z.enum([
    "rohani",
    "kidung-jemaat",
    "pujian",
    "anak",
    "mandarin",
    "english",
  ]),
  number: z.number().int().positive(),
  title: z.string().min(1),
  verses: z.array(z.string().min(1)).min(1),
  lyrics: z.string().min(1),
  midiPath: z.string().min(1),
  pdfPath: z.string().min(1),
  chordRef: ChordRefSchema.optional(),
});
export type HymnCatalogEntry = z.infer<typeof HymnCatalogEntrySchema>;

export const LiteratureCategorySchema = z.enum([
  "kesaksian",
  "warta",
  "panduan",
  "renungan",
  "pelita-kecil",
  "pujian",
  "buku",
]);
export type LiteratureCategory = z.infer<typeof LiteratureCategorySchema>;

export const LiteratureItemSchema = z.object({
  id: z.string().min(1),
  category: LiteratureCategorySchema,
  title: z.string().min(1),
  description: z.string().default(""),
  url: z.string().url(),
  imageUrl: z.string().url().optional(),
  format: z.enum(["article", "issue", "pdf"]).default("article"),
  publishedAt: z.string().datetime({ offset: true }).optional(),
  updatedAt: z.string().datetime({ offset: true }),
  source: z.literal("tjc.org"),
});
export const LiteratureCatalogSchema = z.object({
  source: z.literal("tjc.org"),
  generatedAt: z.string().datetime({ offset: true }),
  items: z.array(LiteratureItemSchema),
});
export type LiteratureItem = z.infer<typeof LiteratureItemSchema>;
export type LiteratureCatalog = z.infer<typeof LiteratureCatalogSchema>;

export const HymnalPdfSongSchema = z.object({
  startPage: z.number().int().positive(),
  pageCount: z.number().int().positive(),
  source: z.string().min(1),
});
export const HymnalPdfManifestSchema = z.object({
  sourceRepo: z.literal("ThenGB/GYSAPP-Fork"),
  sourceCommit: SourceCommitSchema,
  generatedAt: z.string().datetime({ offset: true }),
  bookCode: z.literal("KR"),
  masterPath: z.string().min(1),
  pageCount: z.number().int().positive(),
  songs: z.record(z.string(), HymnalPdfSongSchema),
});
export type HymnalPdfManifest = z.infer<typeof HymnalPdfManifestSchema>;

export const EgysProviderInfoSchema = z.object({
  enabled: z.boolean(),
  clientId: z.string().min(1).nullish(),
});
export const EgysProvidersSchema = z.object({
  google: EgysProviderInfoSchema,
  apple: EgysProviderInfoSchema,
  whatsapp: z.boolean(),
});
export type EgysProviders = z.infer<typeof EgysProvidersSchema>;
export const EgysWhatsAppLoginStartedSchema = z.object({
  pollToken: z.string().min(1),
  referenceCode: z.string().min(1),
  whatsappUrl: z.string().url(),
  expiresAt: z.string().datetime({ offset: true }),
});
export type EgysWhatsAppLoginStarted = z.infer<
  typeof EgysWhatsAppLoginStartedSchema
>;
export const EgysWhatsAppLoginStateSchema = z.object({
  state: z.enum(["WAITING", "READY", "UNKNOWN_SENDER", "EXPIRED"]),
});
export type EgysWhatsAppLoginState = z.infer<
  typeof EgysWhatsAppLoginStateSchema
>;

export const MidiPlaylistItemSchema = z.object({
  songId: z.string().min(1),
  title: z.string().min(1),
  sourceHash: Sha256Schema.optional(),
});
export const MidiPlaylistSchema = z.object({
  version: z.literal(1),
  items: z.array(MidiPlaylistItemSchema),
  currentIndex: z.number().int().nonnegative().default(0),
  loop: z.enum(["off", "one", "all"]).default("off"),
  shuffle: z.boolean().default(false),
  autoNext: z.boolean().default(true),
  crossfadeMs: z.number().int().min(0).max(10_000).default(0),
});
export type MidiPlaylistItem = z.infer<typeof MidiPlaylistItemSchema>;
export type MidiPlaylist = z.infer<typeof MidiPlaylistSchema>;

export const BiblePackManifestSchema = z.object({
  version: z.string().min(1),
  translation: z.literal("TB"),
  generatedAt: z.string().datetime({ offset: true }),
  sha256: Sha256Schema,
  bytes: z.number().int().nonnegative(),
  books: z.number().int().positive(),
});
export type BiblePackManifest = z.infer<typeof BiblePackManifestSchema>;

export const BibleBookSchema = z.object({
  id: z.number().int().positive(),
  short: z.string().min(1),
  name: z.string().min(1),
  chapters: z.number().int().positive(),
});
export const BibleVerseSchema = z.object({
  id: z.string().min(1),
  book: z.string().min(1),
  bookOrder: z.number().int().positive(),
  chapter: z.number().int().positive(),
  verse: z.number().int().positive(),
  text: z.string().min(1),
});
export const BibleReaderPackSchema = z.object({
  version: z.literal(1),
  translation: z.literal("TB"),
  source: z.string().min(1),
  books: z.array(BibleBookSchema).min(1),
  verses: z.array(BibleVerseSchema).min(1),
});
export type BibleBook = z.infer<typeof BibleBookSchema>;
export type BibleVerse = z.infer<typeof BibleVerseSchema>;
export type BibleReaderPack = z.infer<typeof BibleReaderPackSchema>;

export const OnlineContentSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["literature", "media", "sauh", "announcement"]),
  title: z.string().min(1),
  body: z.string(),
  updatedAt: z.string().datetime({ offset: true }),
  url: z.string().url().optional(),
});
export type OnlineContent = z.infer<typeof OnlineContentSchema>;

/** A normalized Sauh Bagi Jiwa entry sourced from the GYS WordPress feed. */
export const SauhPostSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  reference: z.string().min(1).optional(),
  verse: z.string().min(1).optional(),
  body: z.string().min(1),
  url: z.string().url(),
  imageUrl: z.string().url().optional(),
  updatedAt: z.string().datetime({ offset: true }),
  source: z.literal("tjc.org"),
});
export type SauhPost = z.infer<typeof SauhPostSchema>;

export const SuaraSejatiPostSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  excerpt: z.string().min(1),
  url: z.string().url(),
  imageUrl: z.string().url().optional(),
  publishedAt: z.string().datetime({ offset: true }),
  source: z.literal("tjc.org"),
});
export type SuaraSejatiPost = z.infer<typeof SuaraSejatiPostSchema>;
export const SuaraSejatiFeedSchema = z.object({
  source: z.literal("tjc.org"),
  generatedAt: z.string().datetime({ offset: true }),
  items: z.array(SuaraSejatiPostSchema),
});
export type SuaraSejatiFeed = z.infer<typeof SuaraSejatiFeedSchema>;

/**
 * Sanitized article content rendered by the application shell. The source URL
 * is retained for an explicit "source resmi" action, but the reader itself
 * never navigates the user to the upstream site.
 */
export const OnlineArticleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  url: z.string().url(),
  source: z.literal("tjc.org"),
  fetchedAt: z.string().datetime({ offset: true }),
});
export type OnlineArticle = z.infer<typeof OnlineArticleSchema>;

export const AssetKindSchema = z.enum([
  "pack",
  "bible",
  "hymn-catalog",
  "literature",
  "cover",
  "thumbnail",
  "pdf",
  "chord",
  "midi",
  "soundfont",
]);
export const AssetSourceSchema = z.enum(["local", "remote"]);
export const AssetStatusSchema = z.enum([
  "available",
  "remote",
  "downloaded",
  "pinned",
  "stale",
  "missing",
  "corrupt",
]);
export const AssetManifestItemSchema = z.object({
  id: z.string().min(1),
  kind: AssetKindSchema,
  source: AssetSourceSchema,
  path: z.string().min(1),
  url: z.string().url().optional(),
  version: z.string().min(1),
  sha256: Sha256Schema.optional(),
  bytes: z.number().int().nonnegative().optional(),
  status: AssetStatusSchema,
  lastUpdated: z.string().datetime({ offset: true }),
});
export const AssetManifestV1Schema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime({ offset: true }),
  items: z.array(AssetManifestItemSchema),
});
export type AssetKind = z.infer<typeof AssetKindSchema>;
export type AssetManifestItem = z.infer<typeof AssetManifestItemSchema>;
export type AssetManifestV1 = z.infer<typeof AssetManifestV1Schema>;

export const AccountProfileSchema = z.object({
  id: z.string().min(1),
  personId: z.string().min(1).optional(),
  displayName: z.string().min(1),
  email: z.string().email().optional(),
  avatarUrl: z.string().url().optional(),
  branchCode: z.string().min(1).optional(),
  branchName: z.string().min(1).optional(),
  membershipNo: z.string().min(1).optional(),
  memberStatus: z.string().min(1).optional(),
  isMember: z.boolean().optional(),
  permissions: z
    .object({
      viewMembers: z.boolean().optional(),
      createMembers: z.boolean().optional(),
      updateMembers: z.boolean().optional(),
      deleteMembers: z.boolean().optional(),
    })
    .optional(),
  provider: z.enum(["google", "apple", "egys"]).optional(),
  locale: z.enum(["id", "en", "zh"]).default("id"),
});
export type AccountProfile = z.infer<typeof AccountProfileSchema>;

export const EgysUpstreamMetaSchema = z.object({
  sourceRepo: z.literal("Gereja-Yesus-Sejati/egys"),
  sourceCommit: SourceCommitSchema.nullable(),
});
export type EgysUpstreamMeta = z.infer<typeof EgysUpstreamMetaSchema>;

export const ErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "UPSTREAM_UNAVAILABLE",
  "INTEGRITY_ERROR",
  "OFFLINE",
  "INTERNAL_ERROR",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string().min(1),
    requestId: z.string().min(1),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const BackupEnvelopeV2Schema = z.object({
  version: z.literal(2),
  algorithm: z.literal("AES-GCM"),
  kdf: z.literal("PBKDF2-SHA-256"),
  salt: z.string().min(16),
  nonce: z.string().min(12),
  iterations: z.number().int().min(100_000),
  authenticatedMetadata: z.object({
    createdAt: z.string().datetime({ offset: true }),
    appVersion: z.string().min(1),
    domains: z.array(z.enum(["bible", "songs", "faith", "settings"])),
  }),
  ciphertext: z.string().min(1),
  tag: z.string().min(1),
});
export type BackupEnvelopeV2 = z.infer<typeof BackupEnvelopeV2Schema>;

export type Capability =
  | "speech"
  | "audio"
  | "mediaSession"
  | "wakeLock"
  | "fileDialog"
  | "share"
  | "notifications"
  | "deepLinks";

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface AtomicBlobStore {
  get(key: string): Promise<Uint8Array | undefined>;
  putAtomic(key: string, bytes: Uint8Array): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface SpeechVoice {
  id: string;
  name: string;
  language: string;
  local: boolean;
}

export const SpeechEnginePreferenceSchema = z.enum(["auto", "edge", "local"]);
export type SpeechEnginePreference = z.infer<
  typeof SpeechEnginePreferenceSchema
>;
export const EdgeTtsRequestSchema = z.object({
  text: z.string().trim().min(1).max(8_000),
  voice: z
    .string()
    .regex(/^[A-Za-z0-9-]{2,80}$/)
    .default("id-ID-GadisNeural"),
  rate: z.number().min(0.5).max(2).default(0.9),
  pitch: z.number().min(0.5).max(2).default(1),
  volume: z.number().min(0).max(1).default(1),
});
export type EdgeTtsRequest = z.infer<typeof EdgeTtsRequestSchema>;

export interface SpeechProvider {
  readonly id: string;
  status(): Promise<{ available: boolean; offline: boolean; reason?: string }>;
  voices(signal?: AbortSignal): Promise<SpeechVoice[]>;
  speak(
    text: string,
    options: {
      voiceId?: string;
      rate?: number;
      pitch?: number;
      volume?: number;
    },
    signal?: AbortSignal,
  ): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
}

export interface PlatformServices {
  hasCapability(capability: Capability): boolean;
  keyValue: KeyValueStore;
  blobs: AtomicBlobStore;
  speech: SpeechProvider[];
  openExternal(url: string): Promise<void>;
  now(): number;
}

export const LocaleSchema = z.enum(["id", "en", "zh"]);
export type Locale = z.infer<typeof LocaleSchema>;
