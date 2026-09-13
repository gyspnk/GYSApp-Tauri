export const SIDEBAR_COLLAPSED_KEY = "gys-sidebar-collapsed-v1";

export type ShellStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

export function readSidebarCollapsed(storage?: ShellStorage): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(
  storage: ShellStorage | undefined,
  collapsed: boolean,
): void {
  if (!storage) return;
  try {
    storage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // Storage can be unavailable in private/restricted webviews.
  }
}
