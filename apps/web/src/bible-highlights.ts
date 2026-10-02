export const DEFAULT_HIGHLIGHT_COLORS = ["yellow", "blue", "green"] as const;

export function isCustomHighlightColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}
