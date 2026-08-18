import { AccountProfileSchema, type AccountProfile } from "@gys/contracts";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function meaningful(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text && text.toLowerCase() !== "null" && text !== "-"
    ? text
    : undefined;
}

function first(recordValue: JsonRecord, keys: readonly string[]) {
  for (const key of keys) {
    const value = meaningful(recordValue[key]);
    if (value) return value;
  }
  return undefined;
}

function profileRecord(body: unknown): JsonRecord | undefined {
  const root = record(body);
  if (!root || root.error === true) return undefined;
  const data = root.data;
  const dataRecord = Array.isArray(data) ? record(data[0]) : record(data);
  const nested = [root.profile, root.user, root.account, root.membership]
    .map(record)
    .find(Boolean);
  if (!dataRecord && !nested && !root.id && !root.accountId && !root.email)
    return undefined;
  return { ...root, ...(nested ?? {}), ...(dataRecord ?? {}) };
}

function email(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : undefined;
}

function url(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.href
      : undefined;
  } catch {
    return undefined;
  }
}

function membershipState(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (
    normalized.includes("jemaat") ||
    (normalized.includes("baptis") && !normalized.includes("belum")) ||
    normalized === "member" ||
    normalized === "baptized"
  )
    return true;
  if (
    normalized.includes("simpatis") ||
    normalized.includes("belum baptis") ||
    normalized === "unbaptized" ||
    normalized === "visitor"
  )
    return false;
  return undefined;
}

function permissions(value: unknown): AccountProfile["permissions"] {
  const source = record(value);
  if (!source) return undefined;
  const keys = [
    "viewMembers",
    "createMembers",
    "updateMembers",
    "deleteMembers",
    "viewBranches",
    "viewEvents",
    "createEvents",
    "updateEvents",
    "archiveEvents",
  ] as const;
  const result = Object.fromEntries(
    keys.flatMap((key) =>
      typeof source[key] === "boolean" ? [[key, source[key]]] : [],
    ),
  );
  return Object.keys(result).length ? result : undefined;
}

/** Normalize the response from the live e-GYS v1 `/users/profile` endpoint. */
export function normalizeEgysV1Profile(
  body: unknown,
): AccountProfile | undefined {
  const raw = profileRecord(body);
  if (!raw) return undefined;
  const id = first(raw, ["id", "accountId", "account_id", "userId", "user_id"]);
  const displayName = first(raw, [
    "name",
    "fullName",
    "full_name",
    "displayName",
    "username",
    "email",
  ]);
  if (!id || !displayName) return undefined;

  const memberStatus = first(raw, [
    "memberStatus",
    "member_status",
    "memberType",
    "member_type",
    "jenisAnggota",
    "jenis_anggota",
  ]);
  const isMember = membershipState(memberStatus);
  const branchCode = first(raw, [
    "branchCode",
    "branch_code",
    "branchid",
    "branchId",
  ]);
  const branchName = first(raw, [
    "branchName",
    "branch_name",
    "branchname",
    "churchName",
    "church_name",
    "branch",
    "wilayah",
  ]);
  const language = first(raw, ["language", "locale"]);
  return AccountProfileSchema.safeParse({
    id,
    displayName,
    ...(email(first(raw, ["email", "mail"]))
      ? { email: email(first(raw, ["email", "mail"])) }
      : {}),
    ...(url(
      first(raw, [
        "avatarUrl",
        "avatar_url",
        "profilepicture",
        "profilePicture",
        "profile_picture",
        "photoUrl",
      ]),
    )
      ? {
          avatarUrl: url(
            first(raw, [
              "avatarUrl",
              "avatar_url",
              "profilepicture",
              "profilePicture",
              "profile_picture",
              "photoUrl",
            ]),
          ),
        }
      : {}),
    ...(branchCode ? { branchCode } : {}),
    ...(branchName ? { branchName } : {}),
    ...(first(raw, ["membershipNo", "membership_no", "membershipno"])
      ? {
          membershipNo: first(raw, [
            "membershipNo",
            "membership_no",
            "membershipno",
          ]),
        }
      : {}),
    ...(memberStatus ? { memberStatus } : {}),
    ...(isMember === undefined ? {} : { isMember }),
    ...(permissions(raw.permissions ?? raw.can)
      ? { permissions: permissions(raw.permissions ?? raw.can) }
      : {}),
    provider: "egys",
    locale: language === "en" ? "en" : "id",
  }).data;
}
