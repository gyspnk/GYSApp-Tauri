import type { BibleReaderPack } from "@gys/contracts";

export type InstalledBibleSource = {
  getBytes(code: string): Promise<Uint8Array | undefined>;
  getRecord?(code: string): Promise<{ releaseTag?: string } | undefined>;
};

export function bibleTranslationCode(code: string): string {
  switch (code.toLowerCase()) {
    case "b_tb":
      return "TB";
    case "b_kjv":
      return "KJV";
    case "b_cuv":
      return "CUV";
    default:
      return code.toUpperCase();
  }
}

export async function loadBibleReaderPack(
  code: string,
  source: InstalledBibleSource,
): Promise<BibleReaderPack> {
  const bytes = await source.getBytes(code);
  if (!bytes) throw new Error(`Bible asset is not installed: ${code}`);
  const record = await source.getRecord?.(code);
  const releaseTag = record?.releaseTag ?? "unknown";
  const { projectSqliteBibleAsync } = await import("./bible-sql-runtime.js");
  return projectSqliteBibleAsync(
    code,
    bytes,
    `ThenGB/GYSApp-Data@${releaseTag}`,
  );
}
