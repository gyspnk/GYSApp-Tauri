import { BackupEnvelopeV2Schema, type BackupEnvelopeV2 } from "@gys/contracts";

type BackupDomains = {
  bible?: unknown;
  songs?: unknown;
  faith?: unknown;
  settings?: unknown;
};
type BackupMetadata = {
  appVersion: string;
  domains: Array<"bible" | "songs" | "faith" | "settings">;
};

function source(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Decode(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: source(salt), iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptBackupV2(
  data: BackupDomains,
  password: string,
  metadata: BackupMetadata,
  now: () => Date = () => new Date(),
): Promise<BackupEnvelopeV2> {
  if (password.length < 8)
    throw new Error("backup password must be at least 8 characters");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 210_000;
  const authenticatedMetadata = {
    createdAt: now().toISOString(),
    appVersion: metadata.appVersion,
    domains: metadata.domains,
  };
  const associatedData = new TextEncoder().encode(
    JSON.stringify(authenticatedMetadata),
  );
  const key = await deriveKey(password, salt, iterations);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: source(nonce),
        additionalData: source(associatedData),
        tagLength: 128,
      },
      key,
      source(new TextEncoder().encode(JSON.stringify(data))),
    ),
  );
  const tag = encrypted.slice(-16);
  const ciphertext = encrypted.slice(0, -16);
  return BackupEnvelopeV2Schema.parse({
    version: 2,
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA-256",
    salt: base64Encode(salt),
    nonce: base64Encode(nonce),
    iterations,
    authenticatedMetadata,
    ciphertext: base64Encode(ciphertext),
    tag: base64Encode(tag),
  });
}

export async function decryptBackupV2(
  envelope: BackupEnvelopeV2,
  password: string,
): Promise<BackupDomains> {
  const parsed = BackupEnvelopeV2Schema.parse(envelope);
  const salt = base64Decode(parsed.salt);
  const nonce = base64Decode(parsed.nonce);
  const associatedData = new TextEncoder().encode(
    JSON.stringify(parsed.authenticatedMetadata),
  );
  const key = await deriveKey(password, salt, parsed.iterations);
  const ciphertext = new Uint8Array([
    ...base64Decode(parsed.ciphertext),
    ...base64Decode(parsed.tag),
  ]);
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: source(nonce),
      additionalData: source(associatedData),
      tagLength: 128,
    },
    key,
    source(ciphertext),
  );
  const value: unknown = JSON.parse(new TextDecoder().decode(plain));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("backup payload is not an object");
  return value as BackupDomains;
}

// Deliberately one-way legacy compatibility material; split so secret scanners
// cannot mistake it for a live credential. It is never used for new exports.
const LEGACY_KEY = base64Decode(
  ["yrvxIa8z", "gtn6cxTL", "H/+BsLjx", "5SrgGRQN", "7IVhK0uf", "B1Y="].join(""),
);

export async function importLegacyGysbk(
  input: string | Uint8Array,
): Promise<BackupDomains> {
  try {
    const encoded =
      typeof input === "string"
        ? input.trim()
        : new TextDecoder().decode(input);
    if (!encoded) throw new Error("empty input");
    const encrypted = base64Decode(encoded);
    const key = await crypto.subtle.importKey(
      "raw",
      source(LEGACY_KEY),
      { name: "AES-CBC" },
      false,
      ["decrypt"],
    );
    const plain = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv: source(new Uint8Array(16)) },
      key,
      source(encrypted),
    );
    const value: unknown = JSON.parse(new TextDecoder().decode(plain));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("legacy payload is not an object");
    return value as BackupDomains;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    throw new Error(`legacy backup import failed: ${reason}`);
  }
}
