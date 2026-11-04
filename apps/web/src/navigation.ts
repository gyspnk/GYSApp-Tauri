export type Destination = {
  path: string;
  labelKey: string;
  icon: "home" | "bible" | "music" | "faith" | "more";
};

export const DESTINATIONS: readonly Destination[] = [
  {
    path: "/",
    labelKey: "nav.home",
    icon: "home",
  },
  {
    path: "/bible",
    labelKey: "nav.bible",
    icon: "bible",
  },
  {
    path: "/kidung",
    labelKey: "nav.kidung",
    icon: "music",
  },
  {
    path: "/iman",
    labelKey: "nav.iman",
    icon: "faith",
  },
  {
    path: "/lainnya",
    labelKey: "nav.more",
    icon: "more",
  },
];

/**
 * Collection pages keep top-level URLs but belong to the "Lainnya" shelf, so
 * the rail must not fall back to Beranda while they are open.
 */
const COLLECTION_ROOTS = ["/suara", "/literatur", "/sauh"] as const;

export function destinationForPath(pathname: string): string {
  const exact = DESTINATIONS.find((destination) =>
    destination.path === "/"
      ? pathname === "/"
      : pathname === destination.path ||
        pathname.startsWith(`${destination.path}/`),
  );
  if (exact) return exact.path;
  const underCollection = COLLECTION_ROOTS.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
  return underCollection ? "/lainnya" : "/";
}
