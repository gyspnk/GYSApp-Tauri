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
